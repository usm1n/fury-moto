using FluentValidation;
using GearDoctor.Application.Catalog;
using GearDoctor.Domain;

namespace GearDoctor.Application.Content;

// ---------------------------------------------------------------- public
public sealed record GuideSummaryDto(string Slug, string Title, string Type, string Excerpt, string? CoverUrl,
    string? Video, string? Source, DateTimeOffset UpdatedAt);

public sealed record GuideDto(string Slug, string Title, string Type, string Excerpt, string? CoverUrl,
    string? Video, string? Source, DateTimeOffset UpdatedAt, string Body, IReadOnlyList<ProductCardDto> RelatedProducts);

public sealed record FaqDto(string Q, string A);
public sealed record TestimonialDto(string Name, string? Bike, string Quote, int Rating);

// ---------------------------------------------------------------- admin
public sealed record AdminGuideDto(int Id, string Slug, string Title, string Type, string Excerpt, string Body,
    string? CoverKey, string? CoverUrl, string? Video, string? Source, IReadOnlyList<int> RelatedProductIds,
    bool IsPublished, int SortOrder, DateTimeOffset UpdatedAt, string Version, IReadOnlyList<RelatedProductRef> RelatedProducts);
public sealed record RelatedProductRef(int Id, string Title, string? ThumbUrl);

public sealed record GuideUpsert(string? Slug, string Title, string Type, string Excerpt, string Body,
    string? CoverKey, string? Video, string? Source, List<int>? RelatedProductIds, bool? IsPublished, string? Version);

public sealed record AdminFaqDto(int Id, string Q, string A, bool IsPublished, int SortOrder);
public sealed record FaqUpsert(string Q, string A, bool? IsPublished);

public sealed record AdminTestimonialDto(int Id, string Name, string? Bike, string Quote, int Rating, bool IsPublished, int SortOrder);
public sealed record TestimonialUpsert(string Name, string? Bike, string Quote, int Rating, bool? IsPublished);

public sealed class GuideUpsertValidator : AbstractValidator<GuideUpsert>
{
    public GuideUpsertValidator()
    {
        RuleFor(x => x.Slug).MaximumLength(160);
        RuleFor(x => x.Title).NotEmpty().MaximumLength(160);
        RuleFor(x => x.Type).NotEmpty().Must(t => t is not null && GuideTypes.All.Contains(t))
            .WithMessage("Type must be one of: " + string.Join(", ", GuideTypes.All) + ".");
        RuleFor(x => x.Excerpt).NotEmpty().MaximumLength(300);
        RuleFor(x => x.Body).NotEmpty().MaximumLength(40000);
        RuleFor(x => x.CoverKey).MaximumLength(300)
            .Must(k => string.IsNullOrEmpty(k) || k.StartsWith("guides/", StringComparison.Ordinal) || k.StartsWith("assets/", StringComparison.Ordinal))
            .WithMessage("Cover must be an uploaded guide image (guides/...) or an assets/ path.");
        RuleFor(x => x.Video).MaximumLength(60);
        RuleFor(x => x.Source).MaximumLength(500)
            .Must(s => string.IsNullOrEmpty(s) || (Uri.TryCreate(s, UriKind.Absolute, out var u) && (u.Scheme == "https" || u.Scheme == "http")))
            .WithMessage("Source must be an http(s) link.");
        RuleFor(x => x.RelatedProductIds).Must(l => l is null || l.Count <= 8).WithMessage("At most 8 related products.");
    }
}

public sealed class FaqUpsertValidator : AbstractValidator<FaqUpsert>
{
    public FaqUpsertValidator()
    {
        RuleFor(x => x.Q).NotEmpty().MaximumLength(200);
        RuleFor(x => x.A).NotEmpty().MaximumLength(2000);
    }
}

public sealed class TestimonialUpsertValidator : AbstractValidator<TestimonialUpsert>
{
    public TestimonialUpsertValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(80);
        RuleFor(x => x.Bike).MaximumLength(80);
        RuleFor(x => x.Quote).NotEmpty().MaximumLength(600);
        RuleFor(x => x.Rating).InclusiveBetween(1, 5);
    }
}
