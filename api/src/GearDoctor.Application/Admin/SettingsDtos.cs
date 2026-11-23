using FluentValidation;

namespace GearDoctor.Application.Admin;

public sealed record BankDetailsDto(string? BankName, string? AccountTitle, string? Iban);

public sealed record AdminSettingsDto(string? WhatsappNumber, string? PhoneDisplay, string? Email, string? City, string? Address,
    string? Hours, int DeliveryFee, bool CodEnabled, bool BankTransferEnabled, BankDetailsDto? BankDetails, int LowStockThreshold);

public sealed class AdminSettingsValidator : AbstractValidator<AdminSettingsDto>
{
    public AdminSettingsValidator()
    {
        RuleFor(x => x.WhatsappNumber).Matches("^[0-9]{10,15}$").When(x => !string.IsNullOrWhiteSpace(x.WhatsappNumber))
            .WithMessage("WhatsApp number must be 10–15 digits, no spaces or +.");
        RuleFor(x => x.Email).EmailAddress().When(x => !string.IsNullOrWhiteSpace(x.Email)).WithMessage("Enter a valid email address.");
        RuleFor(x => x.PhoneDisplay).MaximumLength(40);
        RuleFor(x => x.City).MaximumLength(60);
        RuleFor(x => x.Address).MaximumLength(300);
        RuleFor(x => x.Hours).MaximumLength(120);
        RuleFor(x => x.DeliveryFee).GreaterThanOrEqualTo(0);
        RuleFor(x => x.LowStockThreshold).GreaterThanOrEqualTo(0);
        RuleFor(x => x.BankDetails).Must(b => b is not null && !string.IsNullOrWhiteSpace(b.BankName)
                && !string.IsNullOrWhiteSpace(b.AccountTitle) && !string.IsNullOrWhiteSpace(b.Iban))
            .When(x => x.BankTransferEnabled).WithMessage("Bank details (bank name, account title, IBAN) are required when bank transfer is enabled.");
        RuleFor(x => x.CodEnabled).Must((x, _) => x.CodEnabled || x.BankTransferEnabled)
            .WithMessage("Enable at least one payment method.");
    }
}
