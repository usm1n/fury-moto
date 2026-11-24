using GearDoctor.Api.Infrastructure;
using GearDoctor.Application.Common;
using GearDoctor.Domain;
using Microsoft.EntityFrameworkCore;

namespace GearDoctor.Api.Endpoints.Admin;

/// <summary>
/// Product images via presigned direct-to-R2 uploads (the API never receives file bytes;
/// Vercel's 4.5 MB body limit makes that mandatory anyway).
///   1. POST /api/admin/uploads/presign { productId, kind: main|thumb|guide|category, contentType: image/webp, bytes }
///      → { uploadUrl, key, headers, expiresAt } (10 min). The admin resized the photo client-side
///      to ≤2000 px WebP (~80 %) + a 480 px WebP thumbnail and PUTs each straight to R2.
///   2. POST /api/admin/products/{id}/images { key, thumbKey, width, height, alt }
///      → server HEADs both objects in R2 (exists, image/webp, within size limit) before saving.
///   reorder / alt edit / delete (delete also removes both R2 objects).
/// </summary>
public static class AdminImageEndpoints
{
    public const long MaxMainBytes = 3 * 1024 * 1024;
    public const long MaxThumbBytes = 300 * 1024;
    private const string WebP = "image/webp";

    public sealed record PresignRequest(int ProductId, string Kind, string? ContentType, long? Bytes);
    public sealed record PresignResponse(string UploadUrl, string Key, IReadOnlyDictionary<string, string> Headers, DateTimeOffset ExpiresAt);
    public sealed record RegisterImageRequest(string Key, string ThumbKey, int Width, int Height, string? Alt);
    public sealed record ImageDto(int Id, string Url, string ThumbUrl, int Width, int Height, string Alt);
    public sealed record PatchImageRequest(string? Alt);
    public sealed record ReorderRequest(int[] Ids);

    public static void Map(RouteGroupBuilder admin)
    {
        admin.MapPost("/uploads/presign", Presign).WithTags("AdminImages");
        admin.MapPost("/products/{id:int}/images", Register).WithTags("AdminImages");
        admin.MapPost("/products/{id:int}/images/reorder", Reorder).WithTags("AdminImages");
        admin.MapPatch("/images/{imageId:int}", Patch).WithTags("AdminImages");
        admin.MapDelete("/images/{imageId:int}", Delete).WithTags("AdminImages");
    }

    internal static ImageDto ToDto(ProductImage i, IFileStorage files) =>
        new(i.Id, files.GetPublicUrl(i.StorageKey), files.GetPublicUrl(i.ThumbKey), i.Width, i.Height, i.Alt);

    private static async Task<IResult> Presign(PresignRequest req, IAppDbContext db, IFileStorage files, CancellationToken ct)
    {
        var errors = new Dictionary<string, string[]>();
        var kind = req.Kind?.ToLowerInvariant();
        if (kind is not ("main" or "thumb" or "guide" or "category")) errors["kind"] = ["kind must be 'main', 'thumb', 'guide' or 'category'."];
        if (req.ContentType is not null && req.ContentType != WebP) errors["contentType"] = ["Only image/webp uploads are accepted (the admin converts photos before upload)."];
        var max = kind == "thumb" ? MaxThumbBytes : MaxMainBytes;
        if (req.Bytes is { } b && (b <= 0 || b > max)) errors["bytes"] = [$"File must be between 1 byte and {max / 1024} KB."];
        if (errors.Count > 0) return Error.Validation(errors).ToProblem();

        if (kind is "main" or "thumb" && !await db.Products.AnyAsync(p => p.Id == req.ProductId, ct)) return Error.NotFound("Product").ToProblem();

        // guide covers are not tied to a product: guides/{guid}.webp (main-size image)
        // category tiles: categories/{guid}.webp (main-size image, not tied to a product)
        var key = kind == "guide" ? $"guides/{Guid.NewGuid():N}.webp"
            : kind == "category" ? $"categories/{Guid.NewGuid():N}.webp"
            : $"products/{req.ProductId}/{Guid.NewGuid():N}{(kind == "thumb" ? "-480" : "")}.webp";
        try
        {
            var p = files.GetPresignedUpload(key, WebP, max, TimeSpan.FromMinutes(10));
            return Results.Ok(new PresignResponse(p.Url, p.Key, p.Headers, p.ExpiresAt));
        }
        catch (InvalidOperationException e)
        {
            return Results.Problem(title: "Image storage is not configured", detail: e.Message, statusCode: StatusCodes.Status503ServiceUnavailable);
        }
    }

    private static async Task<IResult> Register(int id, RegisterImageRequest req, IAppDbContext db, IFileStorage files, IAuditLog audit, CancellationToken ct)
    {
        var prefix = $"products/{id}/";
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrEmpty(req.Key) || !req.Key.StartsWith(prefix, StringComparison.Ordinal) || !req.Key.EndsWith(".webp", StringComparison.Ordinal))
            errors["key"] = ["Key must be a presigned key for this product."];
        if (string.IsNullOrEmpty(req.ThumbKey) || !req.ThumbKey.StartsWith(prefix, StringComparison.Ordinal) || !req.ThumbKey.EndsWith("-480.webp", StringComparison.Ordinal))
            errors["thumbKey"] = ["thumbKey must be a presigned thumbnail key for this product."];
        if (req.Width is <= 0 or > 4000 || req.Height is <= 0 or > 4000) errors["width"] = ["Width/height must be 1–4000 px."];
        if (req.Alt is { Length: > 200 }) errors["alt"] = ["Alt text is at most 200 characters."];
        if (errors.Count > 0) return Error.Validation(errors).ToProblem();

        if (!await db.Products.AnyAsync(p => p.Id == id, ct)) return Error.NotFound("Product").ToProblem();
        if (await db.ProductImages.AnyAsync(i => i.StorageKey == req.Key, ct)) return Error.Conflict("Image already registered").ToProblem();

        // Presigned PUTs can't enforce size/type, so verify what actually landed in R2.
        var main = await files.StatAsync(req.Key, ct);
        var thumb = await files.StatAsync(req.ThumbKey, ct);
        var problem = main is null || thumb is null ? "Upload not found in storage — upload again."
            : main.ContentType != WebP || thumb.ContentType != WebP ? "Uploads must be image/webp."
            : main.Size > MaxMainBytes ? $"Image is larger than {MaxMainBytes / 1024 / 1024} MB."
            : thumb.Size > MaxThumbBytes ? $"Thumbnail is larger than {MaxThumbBytes / 1024} KB."
            : null;
        if (problem is not null)
        {
            if (main is not null) await files.DeleteAsync(req.Key, ct);
            if (thumb is not null) await files.DeleteAsync(req.ThumbKey, ct);
            return Error.Validation("key", problem).ToProblem();
        }

        var next = await db.ProductImages.Where(i => i.ProductId == id).Select(i => (int?)i.SortOrder).MaxAsync(ct) ?? -1;
        var image = new ProductImage
        {
            ProductId = id, StorageKey = req.Key, ThumbKey = req.ThumbKey,
            Width = req.Width, Height = req.Height, Alt = req.Alt?.Trim() ?? "", SortOrder = next + 1,
        };
        db.ProductImages.Add(image);
        await TouchProduct(db, id, ct);
        await db.SaveChangesAsync(ct);
        audit.Record("image.add", "Image", image.Id.ToString(), $"Product #{id}: image #{image.Id} added (position {image.SortOrder + 1})");
        await db.SaveChangesAsync(ct);   // the image id only exists after the first save
        return Results.Created($"/api/admin/images/{image.Id}", ToDto(image, files));
    }

    private static async Task<IResult> Reorder(int id, ReorderRequest req, IAppDbContext db, IAuditLog audit, CancellationToken ct)
    {
        var images = await db.ProductImages.Where(i => i.ProductId == id).ToListAsync(ct);
        if (req.Ids is null || req.Ids.Length != images.Count || !req.Ids.ToHashSet().SetEquals(images.Select(i => i.Id)))
            return Error.Validation("ids", "Send every image id of this product exactly once.").ToProblem();
        var order = req.Ids.Select((imgId, idx) => (imgId, idx)).ToDictionary(x => x.imgId, x => x.idx);
        images.ForEach(i => i.SortOrder = order[i.Id]);
        audit.Record("image.reorder", "Image", id.ToString(), $"Product #{id}: reordered {images.Count} images");
        await TouchProduct(db, id, ct);
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> Patch(int imageId, PatchImageRequest req, IAppDbContext db, IFileStorage files, IAuditLog audit, CancellationToken ct)
    {
        if (req.Alt is { Length: > 200 }) return Error.Validation("alt", "Alt text is at most 200 characters.").ToProblem();
        var img = await db.ProductImages.FirstOrDefaultAsync(i => i.Id == imageId, ct);
        if (img is null) return Error.NotFound("Image").ToProblem();
        img.Alt = req.Alt?.Trim() ?? "";
        audit.Record("image.update", "Image", img.Id.ToString(), $"Product #{img.ProductId}: image #{img.Id} alt text changed");
        await TouchProduct(db, img.ProductId, ct);
        await db.SaveChangesAsync(ct);
        return Results.Ok(ToDto(img, files));
    }

    private static async Task<IResult> Delete(int imageId, IAppDbContext db, IFileStorage files, IAuditLog audit, ILoggerFactory lf, CancellationToken ct)
    {
        var img = await db.ProductImages.FirstOrDefaultAsync(i => i.Id == imageId, ct);
        if (img is null) return Error.NotFound("Image").ToProblem();
        db.ProductImages.Remove(img);
        audit.Record("image.delete", "Image", img.Id.ToString(), $"Product #{img.ProductId}: image #{img.Id} deleted");
        await TouchProduct(db, img.ProductId, ct);
        await db.SaveChangesAsync(ct);
        // Storage cleanup after the row is gone; a failure here only leaves an orphan object.
        foreach (var key in new[] { img.StorageKey, img.ThumbKey }.Where(k => k.StartsWith("products/", StringComparison.Ordinal)))
        {
            try { await files.DeleteAsync(key, ct); }
            catch (Exception e) { lf.CreateLogger("images").LogWarning(e, "Could not delete {Key} from storage", key); }
        }
        return Results.NoContent();
    }

    private static async Task TouchProduct(IAppDbContext db, int productId, CancellationToken ct)
    {
        var p = await db.Products.FirstOrDefaultAsync(x => x.Id == productId, ct);
        if (p is not null) p.UpdatedAt = DateTimeOffset.UtcNow;
    }
}
