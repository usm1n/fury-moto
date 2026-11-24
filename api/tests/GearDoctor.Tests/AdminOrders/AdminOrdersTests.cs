using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using GearDoctor.Api.Infrastructure;
using GearDoctor.Domain;
using GearDoctor.Infrastructure.Persistence;
using GearDoctor.Tests.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace GearDoctor.Tests.AdminOrders;

[Collection(ApiCollection.Name)]
public sealed class AdminOrdersTests(ApiFactory f) : IAsyncLifetime
{
    private string _email = "";
    private const string AdminPassword = "Sup3r-Secret-Pass!";
    private ApiSession _s = null!;
    private Product _helmet = null!;

    public async Task InitializeAsync()
    {
        await f.ResetAsync();
        _email = AuthHelpers.UniqueEmail("orders-admin");
        await AuthHelpers.CreateAdminAsync(f, _email, AdminPassword);
        _s = new ApiSession(f);
        await _s.FetchCsrfAsync();
        Assert.Equal(HttpStatusCode.OK, (await _s.LoginAsync(_email, AdminPassword)).StatusCode);
        await _s.FetchCsrfAsync();
        var cat = await f.AddCategory("Helmets");
        var brand = await f.AddBrand("AGV");
        _helmet = await f.AddProduct(new("Pista Helmet", brand.Id, cat.Id, 50000) { Variants = [new("M", "Black", 5), new("L", "Black", 1)] });
    }

    public Task DisposeAsync() { _s.Dispose(); return Task.CompletedTask; }

    private static async Task<JsonElement> Json(HttpResponseMessage res) =>
        JsonDocument.Parse(await res.Content.ReadAsStringAsync()).RootElement.Clone();

    private async Task<JsonElement> Get(string url, HttpStatusCode expect = HttpStatusCode.OK)
    {
        var res = await _s.SendAsync(HttpMethod.Get, url);
        Assert.Equal(expect, res.StatusCode);
        return await Json(res);
    }

    private async Task<(HttpStatusCode, JsonElement)> Post(string url, object body)
    {
        var res = await _s.SendAsync(HttpMethod.Post, url, body);
        return (res.StatusCode, await Json(res));
    }

    private Task<Order> AddOrder(string number, string name, string phone, OrderStatus status = OrderStatus.New, int qtyM = 2, int qtyL = 0,
        DateTimeOffset? createdAt = null, bool deducted = false) => f.WithDb(async db =>
    {
        var variants = db.ProductVariants.Where(v => v.ProductId == _helmet.Id).ToList();
        var o = new Order
        {
            OrderNumber = number, CustomerName = name, Phone = phone, City = "Lahore", Address = "House 1, Street 2",
            PaymentMethod = PaymentMethod.COD, Status = status, StockDeducted = deducted, Subtotal = 50000 * (qtyM + qtyL), DeliveryFee = 300,
            Total = 50000 * (qtyM + qtyL) + 300, CreatedAt = createdAt ?? DateTimeOffset.UtcNow,
        };
        if (qtyM > 0) o.Items.Add(new OrderItem { ProductId = _helmet.Id, VariantId = variants.First(v => v.Size == "M").Id, TitleSnapshot = "Pista Helmet", SizeSnapshot = "M", ColorSnapshot = "Black", UnitPrice = 50000, Quantity = qtyM });
        if (qtyL > 0) o.Items.Add(new OrderItem { ProductId = _helmet.Id, VariantId = variants.First(v => v.Size == "L").Id, TitleSnapshot = "Pista Helmet", SizeSnapshot = "L", ColorSnapshot = "Black", UnitPrice = 50000, Quantity = qtyL });
        o.History.Add(new OrderStatusEvent { FromStatus = null, ToStatus = OrderStatus.New, At = o.CreatedAt });
        db.Orders.Add(o);
        await db.SaveChangesAsync();
        return o;
    });

    private async Task<int> StockOf(string size) => await f.WithDb(db =>
        Task.FromResult(db.ProductVariants.Where(v => v.ProductId == _helmet.Id && v.Size == size).Select(v => v.Stock).Single()));

    [Fact]
    public async Task Admin_endpoints_require_auth()
    {
        using var anon = ApiSession.Raw(f);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.GetAsync("/api/admin/orders")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.GetAsync("/api/admin/settings")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.GetAsync("/api/admin/dashboard")).StatusCode);
    }

    [Fact]
    public async Task List_filters_search_and_counts()
    {
        await AddOrder("GD-2001", "Ali Khan", "03001234567", createdAt: DateTimeOffset.UtcNow.AddDays(-10));
        await AddOrder("GD-2002", "Sara Ahmed", "03111111111", OrderStatus.Confirmed, createdAt: DateTimeOffset.UtcNow.AddDays(-5));
        await AddOrder("GD-2003", "Bilal Raza", "03222222222", OrderStatus.Cancelled, createdAt: DateTimeOffset.UtcNow.AddDays(-1));

        var all = await Get("/api/admin/orders");
        Assert.Equal(3, all.GetProperty("total").GetInt32());
        Assert.Equal("GD-2003", all.GetProperty("items")[0].GetProperty("orderNumber").GetString());   // newest first
        var counts = all.GetProperty("countsByStatus");
        Assert.Equal(1, counts.GetProperty("New").GetInt32());
        Assert.Equal(1, counts.GetProperty("Confirmed").GetInt32());
        Assert.Equal(0, counts.GetProperty("Shipped").GetInt32());
        Assert.Equal(1, counts.GetProperty("Cancelled").GetInt32());
        Assert.Equal(2, all.GetProperty("items")[0].GetProperty("itemCount").GetInt32());

        var confirmed = await Get("/api/admin/orders?status=Confirmed");
        Assert.Equal(1, confirmed.GetProperty("total").GetInt32());
        Assert.Equal(1, confirmed.GetProperty("countsByStatus").GetProperty("New").GetInt32());   // tabs stay stable

        Assert.Equal(1, (await Get("/api/admin/orders?q=sara")).GetProperty("total").GetInt32());
        Assert.Equal(1, (await Get("/api/admin/orders?q=2001")).GetProperty("total").GetInt32());
        Assert.Equal(1, (await Get("/api/admin/orders?q=03222")).GetProperty("total").GetInt32());

        var from = DateTime.UtcNow.AddDays(-6).ToString("yyyy-MM-dd");
        var to = DateTime.UtcNow.AddDays(-2).ToString("yyyy-MM-dd");
        var ranged = await Get($"/api/admin/orders?from={from}&to={to}");
        Assert.Equal(1, ranged.GetProperty("total").GetInt32());
        Assert.Equal("GD-2002", ranged.GetProperty("items")[0].GetProperty("orderNumber").GetString());

        var paged = await Get("/api/admin/orders?pageSize=2&page=2");
        Assert.Equal(1, paged.GetProperty("items").GetArrayLength());
        Assert.Equal(3, paged.GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task Detail_has_items_history_whatsapp_and_version()
    {
        var o = await AddOrder("GD-2010", "Ali Khan", "0300 1234567", qtyM: 1, qtyL: 1);
        var d = await Get($"/api/admin/orders/{o.Id}");
        Assert.Equal("GD-2010", d.GetProperty("orderNumber").GetString());
        Assert.Equal("Lahore", d.GetProperty("city").GetString());
        Assert.Equal(2, d.GetProperty("items").GetArrayLength());
        Assert.Equal(50000, d.GetProperty("items")[0].GetProperty("lineTotal").GetInt32());
        Assert.Equal(100000, d.GetProperty("subtotal").GetInt32());
        Assert.False(d.GetProperty("stockDeducted").GetBoolean());
        Assert.False(string.IsNullOrEmpty(d.GetProperty("version").GetString()));
        var url = d.GetProperty("whatsappUrl").GetString()!;
        Assert.StartsWith("https://wa.me/923001234567?text=", url);
        Assert.Contains("GD-2010", Uri.UnescapeDataString(url));
        var h = d.GetProperty("history");
        Assert.Equal(1, h.GetArrayLength());
        Assert.Equal("New", h[0].GetProperty("to").GetString());
        Assert.Equal(JsonValueKind.Null, h[0].GetProperty("from").ValueKind);

        await Get("/api/admin/orders/999999", HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Confirm_deducts_stock_and_cancel_restores_it()
    {
        var o = await AddOrder("GD-2020", "Ali", "03001234567", qtyM: 2, qtyL: 1);
        var version = (await Get($"/api/admin/orders/{o.Id}")).GetProperty("version").GetString();

        var (code, body) = await Post($"/api/admin/orders/{o.Id}/status", new { status = "Confirmed", note = "Called customer", version });
        Assert.Equal(HttpStatusCode.OK, code);
        Assert.Equal("Confirmed", body.GetProperty("status").GetString());
        Assert.True(body.GetProperty("stockDeducted").GetBoolean());
        Assert.Equal(3, await StockOf("M"));
        Assert.Equal(0, await StockOf("L"));
        var hist = body.GetProperty("history");
        Assert.Equal(2, hist.GetArrayLength());
        Assert.Equal("Called customer", hist[1].GetProperty("note").GetString());
        Assert.Equal("New", hist[1].GetProperty("from").GetString());
        Assert.Equal(_email, hist[1].GetProperty("by").GetString());

        version = body.GetProperty("version").GetString();
        (code, body) = await Post($"/api/admin/orders/{o.Id}/status", new { status = "Cancelled", version });
        Assert.Equal(HttpStatusCode.OK, code);
        Assert.False(body.GetProperty("stockDeducted").GetBoolean());
        Assert.Equal(5, await StockOf("M"));
        Assert.Equal(1, await StockOf("L"));
    }

    [Fact]
    public async Task Invalid_transition_is_400_and_stale_version_is_409()
    {
        var o = await AddOrder("GD-2030", "Ali", "03001234567");
        var version = (await Get($"/api/admin/orders/{o.Id}")).GetProperty("version").GetString();

        var (code, _) = await Post($"/api/admin/orders/{o.Id}/status", new { status = "Delivered", version });
        Assert.Equal(HttpStatusCode.BadRequest, code);

        var (c2, ok) = await Post($"/api/admin/orders/{o.Id}/status", new { status = "Confirmed", version });
        Assert.Equal(HttpStatusCode.OK, c2);
        Assert.NotEqual(version, ok.GetProperty("version").GetString());

        var (c3, stale) = await Post($"/api/admin/orders/{o.Id}/status", new { status = "Shipped", version });   // old version
        Assert.Equal(HttpStatusCode.Conflict, c3);
        Assert.Equal("/problems/stale", stale.GetProperty("type").GetString());

        var (c4, _) = await Post("/api/admin/orders/999999/status", new { status = "Confirmed", version });
        Assert.Equal(HttpStatusCode.NotFound, c4);
    }

    [Fact]
    public async Task Confirm_with_insufficient_stock_is_409_and_deducts_nothing()
    {
        // M has 5 (fine), L has 1 but the order wants 3 → whole confirmation must fail.
        var o = await AddOrder("GD-2040", "Ali", "03001234567", qtyM: 2, qtyL: 3);
        var version = (await Get($"/api/admin/orders/{o.Id}")).GetProperty("version").GetString();

        var (code, body) = await Post($"/api/admin/orders/{o.Id}/status", new { status = "Confirmed", version });
        Assert.Equal(HttpStatusCode.Conflict, code);
        Assert.Equal("/problems/out-of-stock", body.GetProperty("type").GetString());
        var items = body.GetProperty("items");
        Assert.Equal(1, items.GetArrayLength());
        Assert.Equal("L", items[0].GetProperty("size").GetString());
        Assert.Equal(1, items[0].GetProperty("available").GetInt32());

        Assert.Equal(5, await StockOf("M"));
        Assert.Equal(1, await StockOf("L"));
        var d = await Get($"/api/admin/orders/{o.Id}");
        Assert.Equal("New", d.GetProperty("status").GetString());
        Assert.False(d.GetProperty("stockDeducted").GetBoolean());
    }

    [Fact]
    public async Task Note_adds_history_entry_without_changing_status()
    {
        var o = await AddOrder("GD-2050", "Ali", "03001234567");
        var (code, body) = await Post($"/api/admin/orders/{o.Id}/notes", new { note = "Customer asked to deliver after 5pm" });
        Assert.Equal(HttpStatusCode.OK, code);
        Assert.Equal("New", body.GetProperty("status").GetString());
        var h = body.GetProperty("history");
        Assert.Equal(2, h.GetArrayLength());
        Assert.Equal("New", h[1].GetProperty("from").GetString());
        Assert.Equal("New", h[1].GetProperty("to").GetString());
        Assert.Equal("Customer asked to deliver after 5pm", h[1].GetProperty("note").GetString());
        Assert.Equal(_email, h[1].GetProperty("by").GetString());

        // adding a note does not invalidate the version the UI holds
        var (c2, _) = await Post($"/api/admin/orders/{o.Id}/status", new { status = "Confirmed", version = body.GetProperty("version").GetString() });
        Assert.Equal(HttpStatusCode.OK, c2);

        Assert.Equal(HttpStatusCode.BadRequest, (await Post($"/api/admin/orders/{o.Id}/notes", new { note = "  " })).Item1);
        Assert.Equal(HttpStatusCode.NotFound, (await Post("/api/admin/orders/999999/notes", new { note = "x" })).Item1);
    }

    [Fact]
    public async Task Settings_round_trip_and_validation()
    {
        var defaults = await Get("/api/admin/settings");
        Assert.Equal(3, defaults.GetProperty("lowStockThreshold").GetInt32());
        Assert.True(defaults.GetProperty("codEnabled").GetBoolean());

        var payload = new
        {
            whatsappNumber = "923001234567", phoneDisplay = "0300 1234567", email = "shop@geardoctor.pk", city = "Lahore",
            address = "Main Boulevard", hours = "Mon-Sat 10-8", deliveryFee = 350, codEnabled = true, bankTransferEnabled = true,
            bankDetails = new { bankName = "HBL", accountTitle = "The Gear Doctor", iban = "PK36HABB0000001234567702" }, lowStockThreshold = 2,
        };
        var put = await _s.SendAsync(HttpMethod.Put, "/api/admin/settings", payload);
        Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        var again = await Get("/api/admin/settings");
        Assert.Equal("923001234567", again.GetProperty("whatsappNumber").GetString());
        Assert.Equal(350, again.GetProperty("deliveryFee").GetInt32());
        Assert.Equal("HBL", again.GetProperty("bankDetails").GetProperty("bankName").GetString());
        Assert.Equal(2, again.GetProperty("lowStockThreshold").GetInt32());

        // public settings reflect it
        var pub = await _s.SendAsync(HttpMethod.Get, "/api/settings/public");
        if (pub.StatusCode == HttpStatusCode.OK)
            Assert.Equal(350, (await Json(pub)).GetProperty("deliveryFee").GetInt32());

        // second PUT updates rather than duplicating; nulls clear
        var cleared = await _s.SendAsync(HttpMethod.Put, "/api/admin/settings", new { whatsappNumber = (string?)null, deliveryFee = 0, codEnabled = true, bankTransferEnabled = false, bankDetails = (object?)null, lowStockThreshold = 3 });
        Assert.Equal(HttpStatusCode.OK, cleared.StatusCode);
        var after = await Json(cleared);
        Assert.Equal(JsonValueKind.Null, after.GetProperty("whatsappNumber").ValueKind);
        Assert.Equal(JsonValueKind.Null, after.GetProperty("bankDetails").ValueKind);

        async Task<JsonElement> Bad(object body)
        {
            var r = await _s.SendAsync(HttpMethod.Put, "/api/admin/settings", body);
            Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
            return (await Json(r)).GetProperty("errors");
        }
        Assert.True((await Bad(new { whatsappNumber = "+92 300", deliveryFee = 0, codEnabled = true, lowStockThreshold = 1 })).TryGetProperty("whatsappNumber", out _));
        Assert.True((await Bad(new { email = "nope", deliveryFee = 0, codEnabled = true, lowStockThreshold = 1 })).TryGetProperty("email", out _));
        Assert.True((await Bad(new { deliveryFee = -1, codEnabled = true, lowStockThreshold = 1 })).TryGetProperty("deliveryFee", out _));
        Assert.True((await Bad(new { deliveryFee = 0, codEnabled = true, lowStockThreshold = -1 })).TryGetProperty("lowStockThreshold", out _));
        Assert.True((await Bad(new { deliveryFee = 0, codEnabled = true, bankTransferEnabled = true, lowStockThreshold = 1 })).TryGetProperty("bankDetails", out _));
        Assert.True((await Bad(new { deliveryFee = 0, codEnabled = false, bankTransferEnabled = false, lowStockThreshold = 1 })).TryGetProperty("codEnabled", out _));
    }

    [Fact]
    public async Task Dashboard_numbers()
    {
        var now = DateTimeOffset.UtcNow;
        var thisMonth = new DateTimeOffset(now.Year, now.Month, 1, 0, 0, 1, TimeSpan.Zero);
        var lastMonth = thisMonth.AddMonths(-1);
        await AddOrder("GD-3001", "A", "03001234567", OrderStatus.New, qtyM: 1, createdAt: thisMonth);                       // 50300
        await AddOrder("GD-3002", "B", "03001234567", OrderStatus.Confirmed, qtyM: 1, createdAt: thisMonth);                 // 50300
        await AddOrder("GD-3003", "C", "03001234567", OrderStatus.Delivered, qtyM: 2, createdAt: thisMonth);                 // 100300
        await AddOrder("GD-3004", "D", "03001234567", OrderStatus.Cancelled, qtyM: 1, createdAt: thisMonth);                 // not revenue
        await AddOrder("GD-3005", "E", "03001234567", OrderStatus.Shipped, qtyM: 1, createdAt: lastMonth);                   // last month

        var d = await Get("/api/admin/dashboard");
        Assert.Equal(1, d.GetProperty("newOrders").GetInt32());
        Assert.Equal(3, d.GetProperty("ordersThisMonth").GetInt32());   // the cancelled order is not counted
        Assert.Equal(150600, d.GetProperty("revenueThisMonth").GetInt64());

        // default threshold 3: only L (stock 1) is low; M has 5
        var low = d.GetProperty("lowStock");
        Assert.Equal(1, low.GetArrayLength());
        Assert.Equal("L", low[0].GetProperty("size").GetString());
        Assert.Equal("Pista Helmet", low[0].GetProperty("title").GetString());
        Assert.Equal(1, low[0].GetProperty("stock").GetInt32());

        await f.WithDb(async db =>
        {
            db.Settings.Add(new Setting { Key = SettingKeys.LowStockThreshold, Value = "5", UpdatedAt = DateTimeOffset.UtcNow });
            await db.SaveChangesAsync();
        });
        low = (await Get("/api/admin/dashboard")).GetProperty("lowStock");
        Assert.Equal(2, low.GetArrayLength());
        Assert.Equal("L", low[0].GetProperty("size").GetString());   // ascending by stock
    }
}
