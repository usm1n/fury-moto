using FluentValidation;

namespace GearDoctor.Application.Catalog;

public sealed class ProductListQueryValidator : AbstractValidator<ProductListQuery>
{
    public static readonly string[] Sorts = ["featured", "price-asc", "price-desc", "new", "name"];

    public ProductListQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 60);
        RuleFor(x => x.MinPrice).GreaterThanOrEqualTo(0).When(x => x.MinPrice.HasValue);
        RuleFor(x => x.MaxPrice).GreaterThanOrEqualTo(0).When(x => x.MaxPrice.HasValue);
        RuleFor(x => x.Q).MaximumLength(80);
        RuleFor(x => x.Sort).Must(s => string.IsNullOrEmpty(s) || Sorts.Contains(s))
            .WithMessage("Sort must be one of: " + string.Join(", ", Sorts));
    }
}
