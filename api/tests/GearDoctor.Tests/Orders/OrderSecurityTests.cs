using System.Net;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using System.Text.Json;
using GearDoctor.Application.Common;
using GearDoctor.Application.Orders;
using GearDoctor.Domain;
using GearDoctor.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace GearDoctor.Tests.Orders;

[Collection(ApiCollection.Name)]
public sealed class OrderSecurityTests(ApiFactory f) : IAsyncLifetime
{
    private Category _cat = null!;
    private Brand _brand = null!;

    public async Task InitializeAsync()
    {
        await f.ResetAsync();
        _cat = await f.AddCategory("Helmets", 1);
        _brand = await f.AddBrand("AGV");
    }

    public Task DisposeAsync() => Task.CompletedTask;

    // ---------------------------------------------------------------- helpers

    private Task<Product> Product(string title, int price = 50000, params VariantSpec[] variants) =>
        f.AddProduct(new ProductSpec(title, _brand.Id, _cat.Id, price)
        {
            Variants = variants.Length > 0 ? variants : new[] { new VariantSpec("M", "Black", 5) },
        });

    private static CreateOrderRequest Order(string slug, int qty = 1, int? expected = null,
        string token = StubTurnstileVerifier.PassingToken, string size = "M", string color = "Black") =>
        new("Test Buyer", "03001234567", "Lahore", "12 Test Street, Block A", null, PaymentMethod.COD,
            [new CartLineInput(slug, size, color, qty)], expected, token);

    private async Task<T> Svc<T>(Func<OrderService, Task<T>> action)
    {
        await using var scope = f.Services.CreateAsyncScope();
        return await action(scope.ServiceProvider.GetRequiredService<OrderService>());
    }

    private async Task<string> PlaceOrder(string slug, int qty = 1)
    {
        var r = await Svc(s => s.CreateAsync(Order(slug, qty), "203.0.113.9"));
        Assert.True(r.IsSuccess, r.Error?.Title);
        return r.Value!.OrderNumber;
    }

    private Task<int> OrderCount() => f.WithDb(db => db.Orders.CountAsync());
    private Task<int> OrderIdOf(string number) => f.WithDb(db => db.Orders.AsNoTracking().Where(o => o.OrderNumber == number).Select(o => o.Id).SingleAsync());
    private Task<uint> VersionOf(int orderId) => f.WithDb(db => db.Orders.AsNoTracking().Where(o => o.Id == orderId).Select(o => o.Version).SingleAsync());
    private Task<int> Stock(int variantId) => f.WithDb(db => db.ProductVariants.AsNoTracking().Where(v => v.Id == variantId).Select(v => v.Stock).SingleAsync());
    private Task<int> VariantId(string slug, string size = "M") =>
        f.WithDb(db => db.ProductVariants.AsNoTracking().Where(v => v.Product.Slug == slug && v.Size == size).Select(v => v.Id).SingleAsync());

    private static async Task<JsonElement> Json(HttpResponseMessage res) =>
        JsonDocument.Parse(await res.Content.ReadAsStringAsync()).RootElement.Clone();

    private static object HttpPayload(string slug, int qty, int? expectedTotal, string token = StubTurnstileVerifier.PassingToken) => new
    {
        customerName = "Test Buyer", phone = "03001234567", city = "Lahore", address = "12 Test Street, Block A",
        paymentMethod = "COD", turnstileToken = token, expectedTotal,
        lines = new[] { new { slug, size = "M", color = "Black", quantity = qty } },
    };

    // ------------------------------------------------------- price tampering

    [Fact]
    public async Task Client_supplied_prices_are_ignored_and_stored_prices_come_from_the_database()
    {
        var p = await Product("Tamper Helmet", 50000);
        using var s = new ApiSession(f);
        using var res = await s.Http.PostAsJsonAsync("/api/orders", new
        {
            customerName = "Test Buyer", phone = "03001234567", city = "Lahore", address = "12 Test Street, Block A",
            paymentMethod = "COD", turnstileToken = StubTurnstileVerifier.PassingToken,
            // attacker-controlled price fields: none of these exist on the contract
            unitPrice = 1, total = 1, subtotal = 1, deliveryFee = 0, price = 1,
            lines = new[] { new { slug = p.Slug, size = "M", color = "Black", quantity = 2, unitPrice = 1, price = 1 } },
        });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        Assert.Equal(100000, (await Json(res)).GetProperty("total").GetInt32());

        var stored = await f.WithDb(db => db.OrderItems.AsNoTracking().Select(i => i.UnitPrice).ToListAsync());
        Assert.Equal([50000], stored);
        var total = await f.WithDb(db => db.Orders.AsNoTracking().Select(o => o.Total).SingleAsync());
        Assert.Equal(100000, total);
    }

    [Theory]
    [InlineData(1)]        // client claims far below the real total
    [InlineData(49999)]    // off by one below
    [InlineData(50001)]    // above the real total
    public async Task Expected_total_mismatch_is_409_cart_changed_and_creates_nothing(int expectedTotal)
    {
        var p = await Product("Mismatch Helmet", 50000);
        using var s = new ApiSession(f);
        using var res = await s.Http.PostAsJsonAsync("/api/orders", HttpPayload(p.Slug, 1, expectedTotal));

        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        var body = await Json(res);
        Assert.Equal("/problems/cart-changed", body.GetProperty("type").GetString());
        Assert.Equal(50000, body.GetProperty("cart").GetProperty("total").GetInt32());   // server's real total
        Assert.Equal(0, await OrderCount());
    }

    [Fact]
    public async Task Matching_expected_total_creates_the_order()
    {
        var p = await Product("Match Helmet", 50000);
        using var s = new ApiSession(f);
        using var res = await s.Http.PostAsJsonAsync("/api/orders", HttpPayload(p.Slug, 1, 50000));
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        Assert.Equal(1, await OrderCount());
    }

    // ------------------------------------------------------ cart validation

    [Fact]
    public async Task Cart_validate_reports_ok_reduced_sold_out_and_unavailable_lines()
    {
        var ok = await Product("Ok Helmet", 50000, new VariantSpec("M", "Black", 5));
        var reduced = await Product("Reduced Helmet", 30000, new VariantSpec("M", "Black", 2));
        var soldOut = await Product("Sold Out Helmet", 20000, new VariantSpec("M", "Black", 0));
        var overridden = await Product("Override Helmet", 60000, new VariantSpec("XL", "Black", 3, PriceOverride: 42000));
        var inactive = await Product("Inactive Helmet", 10000, new VariantSpec("M", "Black", 5), new VariantSpec("L", "Black", 5, Active: false));
        await f.AddProduct(new ProductSpec("Draft Helmet", _brand.Id, _cat.Id, 10000) { Status = ProductStatus.Draft });

        var lines = new object[]
        {
            new { slug = ok.Slug, size = "M", color = "Black", quantity = 2 },
            new { slug = reduced.Slug, size = "M", color = "Black", quantity = 5 },
            new { slug = soldOut.Slug, size = "M", color = "Black", quantity = 1 },
            new { slug = overridden.Slug, size = "XL", color = "Black", quantity = 1 },
            new { slug = "no-such-product", size = "M", color = "Black", quantity = 1 },
            new { slug = inactive.Slug, size = "L", color = "Black", quantity = 1 },
            new { slug = "draft-helmet", size = "M", color = "Black", quantity = 1 },
        };
        using var s = new ApiSession(f);
        using var res = await s.Http.PostAsJsonAsync("/api/cart/validate", new { lines });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = await Json(res);

        var byKey = body.GetProperty("lines").EnumerateArray()
            .ToDictionary(l => l.GetProperty("slug").GetString()!, l => l);
        string Status(string slug) => byKey[slug].GetProperty("status").GetString()!;

        Assert.Equal("ok", Status(ok.Slug));
        Assert.Equal(50000, byKey[ok.Slug].GetProperty("unitPrice").GetInt32());
        Assert.Equal(5, byKey[ok.Slug].GetProperty("available").GetInt32());

        Assert.Equal("reduced", Status(reduced.Slug));
        Assert.Equal(2, byKey[reduced.Slug].GetProperty("available").GetInt32());
        Assert.Equal(5, byKey[reduced.Slug].GetProperty("requested").GetInt32());

        Assert.Equal("sold-out", Status(soldOut.Slug));
        Assert.Equal(0, byKey[soldOut.Slug].GetProperty("available").GetInt32());

        Assert.Equal("ok", Status(overridden.Slug));
        Assert.Equal(42000, byKey[overridden.Slug].GetProperty("unitPrice").GetInt32());   // override wins

        Assert.Equal("unavailable", Status("no-such-product"));
        Assert.Equal("unavailable", Status(inactive.Slug));        // inactive variant
        Assert.Equal("unavailable", Status("draft-helmet"));       // draft product is invisible

        // subtotal = ok 2*50000 + reduced min(5,2)*30000 + override 1*42000
        Assert.Equal(202000, body.GetProperty("subtotal").GetInt32());
        Assert.Equal(202000, body.GetProperty("total").GetInt32());
        Assert.False(body.GetProperty("allOk").GetBoolean());
    }

    [Fact]
    public async Task Order_with_a_sold_out_line_is_rejected_as_cart_changed()
    {
        var soldOut = await Product("Empty Helmet", 20000, new VariantSpec("M", "Black", 0));
        var r = await Svc(s => s.CreateAsync(Order(soldOut.Slug), "203.0.113.9"));
        Assert.False(r.IsSuccess);
        Assert.Equal(ErrorKind.Conflict, r.Error!.Kind);
        Assert.Equal("/problems/cart-changed", r.Error.Type);
        Assert.Equal(0, await OrderCount());
    }

    // -------------------------------------------------------------- turnstile

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("bogus-token")]
    public async Task Missing_or_invalid_turnstile_token_is_400_and_creates_nothing(string token)
    {
        var p = await Product("Captcha Helmet", 50000);
        using var s = new ApiSession(f);
        using var res = await s.Http.PostAsJsonAsync("/api/orders", HttpPayload(p.Slug, 1, null, token));
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal(0, await OrderCount());
    }

    // ------------------------------------------------------------ oversell race

    [Fact]
    public async Task Oversell_race_only_one_confirmation_wins_and_stock_never_goes_negative()
    {
        for (var round = 0; round < 5; round++)
        {
            var p = await Product($"Race Helmet {round}", 40000, new VariantSpec("M", "Black", 1));
            var variantId = await VariantId(p.Slug);
            var idA = await OrderIdOf(await PlaceOrder(p.Slug));
            var idB = await OrderIdOf(await PlaceOrder(p.Slug));
            var vA = (await VersionOf(idA)).ToString();
            var vB = (await VersionOf(idB)).ToString();

            var results = await Task.WhenAll(
                Svc(async s => await s.ChangeStatusAsync(idA, new ChangeStatusRequest(OrderStatus.Confirmed, null, vA))),
                Svc(async s => await s.ChangeStatusAsync(idB, new ChangeStatusRequest(OrderStatus.Confirmed, null, vB))));

            Assert.Equal(1, results.Count(r => r.IsSuccess));
            var loser = results.Single(r => !r.IsSuccess).Error!;
            Assert.Equal(ErrorKind.Conflict, loser.Kind);
            Assert.Equal("/problems/out-of-stock", loser.Type);

            Assert.Equal(0, await Stock(variantId));
            var statuses = await f.WithDb(db => db.Orders.AsNoTracking().Where(o => o.Id == idA || o.Id == idB)
                .Select(o => o.Status).ToListAsync());
            Assert.Equal(2, statuses.Count);
            Assert.Equal(1, statuses.Count(st => st == OrderStatus.Confirmed));
            Assert.Equal(1, statuses.Count(st => st == OrderStatus.New));
        }
    }

    // ------------------------------------------------------ cancel restores stock

    [Fact]
    public async Task Cancel_after_confirm_restores_stock_exactly_once_and_cannot_repeat()
    {
        var p = await Product("Cancel Helmet", 30000, new VariantSpec("M", "Black", 5));
        var variantId = await VariantId(p.Slug);
        var id = await OrderIdOf(await PlaceOrder(p.Slug, qty: 2));
        Assert.Equal(5, await Stock(variantId));

        var confirmed = await Svc(async s => await s.ChangeStatusAsync(id, new(OrderStatus.Confirmed, null, (await VersionOf(id)).ToString())));
        Assert.True(confirmed.IsSuccess);
        Assert.Equal(3, await Stock(variantId));

        var cancelled = await Svc(async s => await s.ChangeStatusAsync(id, new(OrderStatus.Cancelled, "customer request", (await VersionOf(id)).ToString())));
        Assert.True(cancelled.IsSuccess);
        Assert.Equal(5, await Stock(variantId));

        // second cancel: the version has moved on, so a stale token is refused...
        var stale = await Svc(async s => await s.ChangeStatusAsync(id, new(OrderStatus.Cancelled, null, confirmed.Value!.Version.ToString())));
        Assert.Equal(ErrorKind.Conflict, stale.Error!.Kind);
        Assert.Equal("/problems/stale", stale.Error.Type);

        // ...and with the fresh version the transition itself is invalid (Cancelled is terminal)
        var again = await Svc(async s => await s.ChangeStatusAsync(id, new(OrderStatus.Cancelled, null, (await VersionOf(id)).ToString())));
        Assert.Equal(ErrorKind.Validation, again.Error!.Kind);
        Assert.Equal(5, await Stock(variantId));

        var reconfirm = await Svc(async s => await s.ChangeStatusAsync(id, new(OrderStatus.Confirmed, null, (await VersionOf(id)).ToString())));
        Assert.Equal(ErrorKind.Validation, reconfirm.Error!.Kind);
        Assert.Equal(5, await Stock(variantId));
    }

    [Fact]
    public async Task Cancelling_an_unconfirmed_order_does_not_restore_stock()
    {
        var p = await Product("Never Deducted Helmet", 30000, new VariantSpec("M", "Black", 5));
        var variantId = await VariantId(p.Slug);
        var id = await OrderIdOf(await PlaceOrder(p.Slug, qty: 3));
        var r = await Svc(async s => await s.ChangeStatusAsync(id, new(OrderStatus.Cancelled, null, (await VersionOf(id)).ToString())));
        Assert.True(r.IsSuccess);
        Assert.Equal(5, await Stock(variantId));
    }

    // ------------------------------------------------------------ order numbers

    [Fact]
    public async Task Ten_concurrent_creates_get_unique_sequential_looking_numbers()
    {
        var p = await Product("Burst Helmet", 50000, new VariantSpec("M", "Black", 50));
        var results = await Task.WhenAll(Enumerable.Range(0, 10)
            .Select(_ => Svc(s => s.CreateAsync(Order(p.Slug), "203.0.113.9"))));

        Assert.All(results, r => Assert.True(r.IsSuccess, r.Error?.Title));
        var numbers = results.Select(r => r.Value!.OrderNumber).ToList();
        Assert.Equal(10, numbers.Distinct().Count());
        Assert.All(numbers, n => Assert.Matches(new Regex(@"^GD-\d{4,}$"), n));
        var seq = numbers.Select(n => int.Parse(n[3..])).Order().ToArray();
        Assert.Equal(Enumerable.Range(1001, 10).ToArray(), seq);   // sequence starts at 1001, no gaps
        Assert.Equal(10, await OrderCount());
    }
}
