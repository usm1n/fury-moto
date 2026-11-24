using System.Globalization;
using System.Text;
using System.Text.Json;
using FluentValidation;
using GearDoctor.Application.Common;
using GearDoctor.Domain;
using Microsoft.EntityFrameworkCore;

namespace GearDoctor.Application.Orders;

/* ------------------------------- DTOs (match openapi.draft.yaml) ------------------------------- */

public sealed record CartLineInput(string Slug, string Size, string Color, int Quantity);
public sealed record CartValidateRequest(List<CartLineInput> Lines);
public sealed record CartLineResult(string Slug, string Size, string Color, int Requested, int Available, int UnitPrice,
    string Title, string? ThumbUrl, string Status);
public sealed record CartValidation(List<CartLineResult> Lines, int Subtotal, int DeliveryFee, int Total)
{
    public bool AllOk => Lines.All(l => l.Status == "ok");
}

public sealed record CreateOrderRequest(string CustomerName, string Phone, string City, string Address, string? Notes,
    PaymentMethod PaymentMethod, List<CartLineInput> Lines, int? ExpectedTotal, string TurnstileToken);
public sealed record OrderCreated(string OrderNumber, int Total, string WhatsappUrl, string WhatsappMessage);

public sealed record ChangeStatusRequest(OrderStatus Status, string? Note, string Version);

/* ------------------------------------------ validation ---------------------------------------- */

public sealed class CartLineValidator : AbstractValidator<CartLineInput>
{
    public CartLineValidator()
    {
        RuleFor(x => x.Slug).NotEmpty().MaximumLength(160);
        RuleFor(x => x.Size).NotEmpty().MaximumLength(20);
        RuleFor(x => x.Color).NotEmpty().MaximumLength(40);
        RuleFor(x => x.Quantity).InclusiveBetween(1, 10);
    }
}

public sealed class CartValidateRequestValidator : AbstractValidator<CartValidateRequest>
{
    public CartValidateRequestValidator()
    {
        RuleFor(x => x.Lines).NotNull().Must(l => l is { Count: >= 1 and <= 30 }).WithMessage("Cart must have 1–30 lines.");
        RuleForEach(x => x.Lines).SetValidator(new CartLineValidator());
    }
}

public sealed class CreateOrderValidator : AbstractValidator<CreateOrderRequest>
{
    public CreateOrderValidator()
    {
        RuleFor(x => x.CustomerName).NotEmpty().MaximumLength(80);
        RuleFor(x => x.Phone).NotEmpty().Matches(@"^\+?[0-9 \-]{10,16}$").WithMessage("Enter a valid phone number.");
        RuleFor(x => x.City).NotEmpty().MaximumLength(60);
        RuleFor(x => x.Address).NotEmpty().MinimumLength(8).MaximumLength(300);
        RuleFor(x => x.Notes).MaximumLength(500);
        RuleFor(x => x.PaymentMethod).IsInEnum();
        RuleFor(x => x.TurnstileToken).NotEmpty().WithMessage("Please complete the verification.");
        RuleFor(x => x.Lines).NotNull().Must(l => l is { Count: >= 1 and <= 30 }).WithMessage("Cart must have 1–30 lines.");
        RuleForEach(x => x.Lines).SetValidator(new CartLineValidator());
    }
}

/* -------------------------------------------- service ----------------------------------------- */

/// <summary>
/// Orders: server-side pricing, availability checks, order numbers, status transitions with
/// atomic stock deduct/restore. Client prices are never trusted — `expectedTotal` is only used
/// to detect "the cart changed since you looked" and is never charged.
/// </summary>
public sealed class OrderService(
    IAppDbContext db,
    IFileStorage files,
    ITurnstileVerifier turnstile,
    ICurrentUser currentUser,
    IAuditLog audit,
    IClock clock,
    IValidator<CreateOrderRequest> createValidator,
    IValidator<CartValidateRequest> cartValidator)
{
    /* ---------- cart / pricing ---------- */

    public async Task<Result<CartValidation>> ValidateCartAsync(CartValidateRequest req, CancellationToken ct = default)
    {
        var v = await cartValidator.ValidateAsync(req, ct);
        if (!v.IsValid) return Error.Validation(ToDict(v));
        return await PriceAsync(req.Lines, ct);
    }

    /// <summary>Re-price lines from the database. Duplicate lines (same variant) are merged.</summary>
    private async Task<CartValidation> PriceAsync(IEnumerable<CartLineInput> input, CancellationToken ct)
    {
        var lines = input
            .GroupBy(l => (Slug: l.Slug.Trim().ToLowerInvariant(), l.Size, l.Color))
            .Select(g => new CartLineInput(g.Key.Slug, g.Key.Size, g.Key.Color, Math.Min(10, g.Sum(x => x.Quantity))))
            .ToList();
        var slugs = lines.Select(l => l.Slug).Distinct().ToList();

        var products = await db.Products.AsNoTracking()
            .Where(p => slugs.Contains(p.Slug) && p.Status == ProductStatus.Published)
            .Select(p => new
            {
                p.Slug, p.Title, p.Price,
                Thumb = p.Images.OrderBy(i => i.SortOrder).Select(i => i.ThumbKey).FirstOrDefault(),
                Variants = p.Variants.Where(x => x.IsActive).Select(x => new { x.Size, x.Color, x.Stock, x.PriceOverride }).ToList(),
            })
            .ToListAsync(ct);
        var bySlug = products.ToDictionary(p => p.Slug);

        var results = new List<CartLineResult>(lines.Count);
        foreach (var l in lines)
        {
            if (!bySlug.TryGetValue(l.Slug, out var p))
            {
                results.Add(new(l.Slug, l.Size, l.Color, l.Quantity, 0, 0, "", null, "unavailable"));
                continue;
            }
            var variant = p.Variants.FirstOrDefault(x => x.Size == l.Size && x.Color == l.Color);
            var thumb = p.Thumb is null ? null : files.GetPublicUrl(p.Thumb);
            if (variant is null)
            {
                results.Add(new(l.Slug, l.Size, l.Color, l.Quantity, 0, p.Price, p.Title, thumb, "unavailable"));
                continue;
            }
            var price = variant.PriceOverride ?? p.Price;
            var status = variant.Stock <= 0 ? "sold-out" : variant.Stock < l.Quantity ? "reduced" : "ok";
            results.Add(new(l.Slug, l.Size, l.Color, l.Quantity, Math.Max(0, variant.Stock), price, p.Title, thumb, status));
        }

        var subtotal = results.Where(r => r.Status is "ok" or "reduced").Sum(r => r.UnitPrice * Math.Min(r.Requested, r.Available));
        var deliveryFee = subtotal > 0 ? await SettingAsync(SettingKeys.DeliveryFee, 0, ct) : 0;
        return new CartValidation(results, subtotal, deliveryFee, subtotal + deliveryFee);
    }

    /* ---------- create ---------- */

    public async Task<Result<OrderCreated>> CreateAsync(CreateOrderRequest req, string? remoteIp, CancellationToken ct = default)
    {
        var v = await createValidator.ValidateAsync(req, ct);
        if (!v.IsValid) return Error.Validation(ToDict(v));

        if (!await turnstile.VerifyAsync(req.TurnstileToken, remoteIp, ct))
            return Error.Validation("turnstileToken", "Verification failed. Please try again.");

        var payOk = req.PaymentMethod switch
        {
            PaymentMethod.COD => await SettingAsync(SettingKeys.CodEnabled, true, ct),
            PaymentMethod.BankTransfer => await SettingAsync(SettingKeys.BankTransferEnabled, false, ct),
            _ => false,
        };
        if (!payOk) return Error.Validation("paymentMethod", "This payment method isn't available.");

        var cart = await PriceAsync(req.Lines, ct);
        if (!cart.AllOk || (req.ExpectedTotal is { } expected && expected != cart.Total))
            return Error.Conflict("Your cart has changed", "Some prices or stock levels changed. Please review your cart.",
                type: "/problems/cart-changed", ext: new { cart });

        // Resolve variant ids for snapshots (prices come from `cart`, i.e. the database).
        var keys = cart.Lines.Select(l => l.Slug).Distinct().ToList();
        var variants = await db.ProductVariants.AsNoTracking()
            .Where(x => keys.Contains(x.Product.Slug) && x.IsActive)
            .Select(x => new { x.Id, x.ProductId, Slug = x.Product.Slug, x.Size, x.Color })
            .ToListAsync(ct);

        var now = clock.Now;
        var strategy = db.Database.CreateExecutionStrategy();
        var order = await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var seq = await db.NextOrderNumberAsync(ct);
            var o = new Order
            {
                OrderNumber = $"GD-{seq}",
                CustomerName = req.CustomerName.Trim(),
                Phone = req.Phone.Trim(),
                City = req.City.Trim(),
                Address = req.Address.Trim(),
                Notes = string.IsNullOrWhiteSpace(req.Notes) ? null : req.Notes.Trim(),
                PaymentMethod = req.PaymentMethod,
                Status = OrderStatus.New,
                Subtotal = cart.Subtotal,
                DeliveryFee = cart.DeliveryFee,
                Total = cart.Total,
                CreatedAt = now,
            };
            foreach (var l in cart.Lines)
            {
                var variant = variants.First(x => x.Slug == l.Slug && x.Size == l.Size && x.Color == l.Color);
                o.Items.Add(new OrderItem
                {
                    ProductId = variant.ProductId, VariantId = variant.Id,
                    TitleSnapshot = l.Title, SizeSnapshot = l.Size, ColorSnapshot = l.Color,
                    UnitPrice = l.UnitPrice, Quantity = l.Requested,
                });
            }
            o.History.Add(new OrderStatusEvent { FromStatus = null, ToStatus = OrderStatus.New, At = now });
            db.Orders.Add(o);
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return o;
        });

        var message = BuildCustomerMessage(order);
        var number = await SettingAsync<string?>(SettingKeys.WhatsappNumber, null, ct);
        var url = WhatsappUrl(number, message);
        return new OrderCreated(order.OrderNumber, order.Total, url, message);
    }

    /* ---------- status transitions (admin) ---------- */

    /// <summary>
    /// New→Confirmed deducts stock atomically (fails with /problems/out-of-stock if any variant is short);
    /// Cancelled after deduction restores it. One transaction; guarded by the order's xmin version.
    /// </summary>
    public async Task<Result<Order>> ChangeStatusAsync(int orderId, ChangeStatusRequest req, CancellationToken ct = default)
    {
        if (!uint.TryParse(req.Version, out var version)) return Error.Validation("version", "Version is required.");

        var strategy = db.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var order = await db.Orders.Include(o => o.Items).Include(o => o.History).FirstOrDefaultAsync(o => o.Id == orderId, ct);
            if (order is null) return (Result<Order>)Error.NotFound("Order");
            if (order.Version != version)
                return Error.Conflict("This order was changed by someone else", "Reload it and try again.", type: "/problems/stale");
            if (!Order.CanTransition(order.Status, req.Status))
                return Error.Validation("status", $"Can't change an order from {order.Status} to {req.Status}.");

            // aggregate quantities per variant
            var stockNote = "";
            var perVariant = order.Items.GroupBy(i => i.VariantId).Select(g => (VariantId: g.Key, Qty: g.Sum(i => i.Quantity))).ToList();

            if (req.Status == OrderStatus.Confirmed && !order.StockDeducted)
            {
                var short_ = new List<object>();
                foreach (var (variantId, qty) in perVariant)
                {
                    // Atomic check-and-decrement: two confirmations can't both take the last unit.
                    var affected = await db.Database.ExecuteSqlInterpolatedAsync(
                        $"UPDATE \"ProductVariants\" SET \"Stock\" = \"Stock\" - {qty} WHERE \"Id\" = {variantId} AND \"Stock\" >= {qty}", ct);
                    if (affected == 0)
                    {
                        var item = order.Items.First(i => i.VariantId == variantId);
                        var stock = await db.ProductVariants.IgnoreQueryFilters().Where(x => x.Id == variantId).Select(x => x.Stock).FirstOrDefaultAsync(ct);
                        short_.Add(new { variantId, title = item.TitleSnapshot, size = item.SizeSnapshot, color = item.ColorSnapshot, requested = qty, available = stock });
                    }
                }
                if (short_.Count > 0)
                {
                    await tx.RollbackAsync(ct);
                    return Error.Conflict("Not enough stock to confirm this order", "Restock or edit the order first.",
                        type: "/problems/out-of-stock", ext: new { items = short_ });
                }
                order.StockDeducted = true; stockNote = " (stock deducted)";
            }
            else if (req.Status == OrderStatus.Cancelled && order.StockDeducted)
            {
                foreach (var (variantId, qty) in perVariant)
                    await db.Database.ExecuteSqlInterpolatedAsync(
                        $"UPDATE \"ProductVariants\" SET \"Stock\" = \"Stock\" + {qty} WHERE \"Id\" = {variantId}", ct);
                order.StockDeducted = false; stockNote = " (stock restored)";
            }

            order.History.Add(new OrderStatusEvent
            {
                FromStatus = order.Status, ToStatus = req.Status,
                Note = string.IsNullOrWhiteSpace(req.Note) ? null : req.Note.Trim()[..Math.Min(500, req.Note.Trim().Length)],
                ChangedByUserId = currentUser.UserId, At = clock.Now,
            });
            audit.Record("order.status", "Order", order.Id.ToString(),
                $"{order.OrderNumber}: {order.Status} → {req.Status}{stockNote}" +
                (string.IsNullOrWhiteSpace(req.Note) ? "" : $". Note: {req.Note.Trim()}"));
            order.Status = req.Status;
            try
            {
                await db.SaveChangesAsync(ct);   // xmin check on the order row
            }
            catch (DbUpdateConcurrencyException)
            {
                await tx.RollbackAsync(ct);
                return Error.Conflict("This order was changed by someone else", "Reload it and try again.", type: "/problems/stale");
            }
            await tx.CommitAsync(ct);
            return order;
        });
    }

    /* ---------- helpers ---------- */

    public static string FormatPkr(int amount) => "Rs " + amount.ToString("N0", CultureInfo.InvariantCulture);

    public static string BuildCustomerMessage(Order o)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"Hi! I just placed order #{o.OrderNumber}:").AppendLine();
        var i = 1;
        foreach (var it in o.Items)
            sb.AppendLine($"{i++}. {it.TitleSnapshot} — Size {it.SizeSnapshot} — {it.ColorSnapshot} × {it.Quantity} = {FormatPkr(it.UnitPrice * it.Quantity)}");
        sb.AppendLine().AppendLine($"Subtotal: {FormatPkr(o.Subtotal)}");
        if (o.DeliveryFee > 0) sb.AppendLine($"Delivery: {FormatPkr(o.DeliveryFee)}");
        sb.AppendLine($"Total: {FormatPkr(o.Total)}");
        sb.AppendLine($"Payment: {(o.PaymentMethod == PaymentMethod.COD ? "Cash on delivery" : "Bank transfer")}").AppendLine();
        sb.AppendLine($"Name: {o.CustomerName}").AppendLine($"Phone: {o.Phone}").AppendLine($"City: {o.City}").Append($"Address: {o.Address}");
        if (o.Notes is not null) sb.AppendLine().Append($"Notes: {o.Notes}");
        return sb.ToString();
    }

    /// <summary>Admin → customer message (order summary for "Message customer on WhatsApp").</summary>
    public static string BuildAdminMessage(Order o) =>
        $"Hi {o.CustomerName}, this is The Gear Doctor about your order #{o.OrderNumber} " +
        $"({o.Items.Sum(i => i.Quantity)} item(s), total {FormatPkr(o.Total)}). Status: {o.Status}.";

    public static string WhatsappUrl(string? number, string message)
    {
        var digits = new string((number ?? "").Where(char.IsDigit).ToArray());
        return $"https://wa.me/{digits}?text={Uri.EscapeDataString(message)}";
    }

    /// <summary>Pakistani mobile numbers: 03xx… → 923xx… for wa.me.</summary>
    public static string ToInternational(string phone)
    {
        var d = new string(phone.Where(char.IsDigit).ToArray());
        return d.StartsWith('0') && d.Length == 11 ? "92" + d[1..] : d;
    }

    private async Task<T> SettingAsync<T>(string key, T fallback, CancellationToken ct)
    {
        var raw = await db.Settings.AsNoTracking().Where(s => s.Key == key).Select(s => s.Value).FirstOrDefaultAsync(ct);
        if (raw is null) return fallback;
        try { return JsonSerializer.Deserialize<T>(raw) ?? fallback; }
        catch (JsonException) { return fallback; }
    }

    private static Dictionary<string, string[]> ToDict(FluentValidation.Results.ValidationResult v) =>
        v.Errors.GroupBy(e => char.ToLowerInvariant(e.PropertyName[0]) + e.PropertyName[1..])
            .ToDictionary(g => g.Key, g => g.Select(e => e.ErrorMessage).ToArray());
}
