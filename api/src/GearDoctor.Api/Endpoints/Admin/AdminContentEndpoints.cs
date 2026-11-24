using GearDoctor.Api.Infrastructure;
using GearDoctor.Application.Admin;
using GearDoctor.Application.Content;

namespace GearDoctor.Api.Endpoints.Admin;

/// <summary>Admin guides, FAQs, testimonials, audit log and alerts. Group already enforces Admin + CSRF.</summary>
public static class AdminContentEndpoints
{
    public static void Map(RouteGroupBuilder admin)
    {
        const string tag = "AdminContent";

        admin.MapGet("/guides", async (AdminContentService s, CancellationToken ct) => Results.Ok(await s.ListGuidesAsync(ct))).WithTags(tag);
        admin.MapPost("/guides", async (GuideUpsert req, AdminContentService s, CancellationToken ct) =>
            (await s.CreateGuideAsync(req, ct)).ToHttp(x => Results.Created($"/api/admin/guides/{x.Id}", x))).WithTags(tag);
        admin.MapPost("/guides/reorder", async (ReorderRequest req, AdminContentService s, CancellationToken ct) =>
            (await s.ReorderGuidesAsync(req, ct)).ToHttp()).WithTags(tag);
        admin.MapGet("/guides/{id:int}", async (int id, AdminContentService s, CancellationToken ct) =>
            (await s.GetGuideAsync(id, ct)).ToHttp()).WithTags(tag);
        admin.MapPut("/guides/{id:int}", async (int id, GuideUpsert req, AdminContentService s, CancellationToken ct) =>
            (await s.UpdateGuideAsync(id, req, ct)).ToHttp()).WithTags(tag);
        admin.MapDelete("/guides/{id:int}", async (int id, AdminContentService s, CancellationToken ct) =>
            (await s.DeleteGuideAsync(id, ct)).ToHttp()).WithTags(tag);

        admin.MapGet("/faqs", async (AdminContentService s, CancellationToken ct) => Results.Ok(await s.ListFaqsAsync(ct))).WithTags(tag);
        admin.MapPost("/faqs", async (FaqUpsert req, AdminContentService s, CancellationToken ct) =>
            (await s.CreateFaqAsync(req, ct)).ToHttp(x => Results.Created($"/api/admin/faqs/{x.Id}", x))).WithTags(tag);
        admin.MapPost("/faqs/reorder", async (ReorderRequest req, AdminContentService s, CancellationToken ct) =>
            (await s.ReorderFaqsAsync(req, ct)).ToHttp()).WithTags(tag);
        admin.MapGet("/faqs/{id:int}", async (int id, AdminContentService s, CancellationToken ct) =>
            (await s.GetFaqAsync(id, ct)).ToHttp()).WithTags(tag);
        admin.MapPut("/faqs/{id:int}", async (int id, FaqUpsert req, AdminContentService s, CancellationToken ct) =>
            (await s.UpdateFaqAsync(id, req, ct)).ToHttp()).WithTags(tag);
        admin.MapDelete("/faqs/{id:int}", async (int id, AdminContentService s, CancellationToken ct) =>
            (await s.DeleteFaqAsync(id, ct)).ToHttp()).WithTags(tag);

        admin.MapGet("/testimonials", async (AdminContentService s, CancellationToken ct) => Results.Ok(await s.ListTestimonialsAsync(ct))).WithTags(tag);
        admin.MapPost("/testimonials", async (TestimonialUpsert req, AdminContentService s, CancellationToken ct) =>
            (await s.CreateTestimonialAsync(req, ct)).ToHttp(x => Results.Created($"/api/admin/testimonials/{x.Id}", x))).WithTags(tag);
        admin.MapPost("/testimonials/reorder", async (ReorderRequest req, AdminContentService s, CancellationToken ct) =>
            (await s.ReorderTestimonialsAsync(req, ct)).ToHttp()).WithTags(tag);
        admin.MapGet("/testimonials/{id:int}", async (int id, AdminContentService s, CancellationToken ct) =>
            (await s.GetTestimonialAsync(id, ct)).ToHttp()).WithTags(tag);
        admin.MapPut("/testimonials/{id:int}", async (int id, TestimonialUpsert req, AdminContentService s, CancellationToken ct) =>
            (await s.UpdateTestimonialAsync(id, req, ct)).ToHttp()).WithTags(tag);
        admin.MapDelete("/testimonials/{id:int}", async (int id, AdminContentService s, CancellationToken ct) =>
            (await s.DeleteTestimonialAsync(id, ct)).ToHttp()).WithTags(tag);

        admin.MapGet("/audit", async (string? entity, string? entityId, int? page, int? pageSize, AuditService s, CancellationToken ct) =>
            (await s.ListAsync(entity, entityId, page, pageSize, ct)).ToHttp()).WithTags("AdminAudit");
        admin.MapGet("/alerts", async (AuditService s, CancellationToken ct) => Results.Ok(await s.AlertsAsync(ct))).WithTags("AdminAudit");
    }
}
