using GearDoctor.Application.Common;
using GearDoctor.Domain;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace GearDoctor.Infrastructure.Persistence;

public sealed class AppUser : IdentityUser
{
    /// <summary>Seeded admin must change the initial password on first login.</summary>
    public bool MustChangePassword { get; set; }
}

public sealed class AppDbContext(DbContextOptions<AppDbContext> options)
    : IdentityDbContext<AppUser>(options), IAppDbContext, IDataProtectionKeyContext
{
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Brand> Brands => Set<Brand>();
    public DbSet<Certification> Certifications => Set<Certification>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<ProductVariant> ProductVariants => Set<ProductVariant>();
    public DbSet<ProductImage> ProductImages => Set<ProductImage>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<OrderStatusEvent> OrderStatusEvents => Set<OrderStatusEvent>();
    public DbSet<Setting> Settings => Set<Setting>();
    public DbSet<Guide> Guides => Set<Guide>();
    public DbSet<Faq> Faqs => Set<Faq>();
    public DbSet<Testimonial> Testimonials => Set<Testimonial>();
    public DbSet<AuditEntry> AuditEntries => Set<AuditEntry>();
    /// <summary>ASP.NET Data Protection keys (shared across serverless instances).</summary>
    public DbSet<DataProtectionKey> DataProtectionKeys => Set<DataProtectionKey>();

    public async Task<long> NextOrderNumberAsync(CancellationToken ct = default)
    {
        await using var cmd = Database.GetDbConnection().CreateCommand();
        cmd.CommandText = "SELECT nextval('order_number_seq')";
        if (cmd.Connection!.State != System.Data.ConnectionState.Open) await cmd.Connection.OpenAsync(ct);
        cmd.Transaction = Database.CurrentTransaction?.GetDbTransaction();
        return (long)(await cmd.ExecuteScalarAsync(ct))!;
    }

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);   // Identity tables
        b.HasSequence<long>("order_number_seq").StartsAt(1001).IncrementsBy(1);

        b.Entity<Category>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(60);
            e.Property(x => x.Slug).HasMaxLength(80);
            e.HasIndex(x => x.Slug).IsUnique();
            e.HasIndex(x => x.SortOrder);
        });

        b.Entity<Brand>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(60);
            e.Property(x => x.Slug).HasMaxLength(80);
            e.HasIndex(x => x.Slug).IsUnique();
        });

        b.Entity<Certification>(e =>
        {
            e.Property(x => x.Code).HasMaxLength(20);
            e.Property(x => x.Name).HasMaxLength(40);
            e.HasIndex(x => x.Code).IsUnique();
        });

        b.Entity<Product>(e =>
        {
            e.Property(x => x.Title).HasMaxLength(140);
            e.Property(x => x.Slug).HasMaxLength(160);
            e.Property(x => x.ShortDescription).HasMaxLength(300);
            e.Property(x => x.Description).HasMaxLength(8000);
            e.Property(x => x.GearDoctorNote).HasMaxLength(500);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(12);
            e.Property(x => x.Badges).HasColumnType("text[]");
            e.Property(x => x.Version).IsRowVersion();                       // xmin
            e.HasQueryFilter(x => x.DeletedAt == null);                     // soft delete
            e.HasIndex(x => x.Slug).IsUnique().HasFilter("\"DeletedAt\" IS NULL");
            e.HasIndex(x => new { x.Status, x.CategoryId, x.SortOrder });
            e.HasIndex(x => x.BrandId);
            e.HasIndex(x => x.IsFeatured).HasFilter("\"IsFeatured\"");
            e.HasOne(x => x.Brand).WithMany().HasForeignKey(x => x.BrandId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Category).WithMany(c => c.Products).HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.Restrict);
            e.HasMany(x => x.Certifications).WithMany().UsingEntity("ProductCertification",
                l => l.HasOne(typeof(Certification)).WithMany().HasForeignKey("CertificationId"),
                r => r.HasOne(typeof(Product)).WithMany().HasForeignKey("ProductId"));
            e.HasMany(x => x.Variants).WithOne(v => v.Product).HasForeignKey(v => v.ProductId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(x => x.Images).WithOne().HasForeignKey(i => i.ProductId).OnDelete(DeleteBehavior.Cascade);
            e.OwnsMany(x => x.Specs, s => s.ToJson());
        });

        b.Entity<ProductVariant>(e =>
        {
            e.Property(x => x.Size).HasMaxLength(20);
            e.Property(x => x.Color).HasMaxLength(40);
            e.Property(x => x.ColorHex).HasMaxLength(9);
            e.Property(x => x.Sku).HasMaxLength(64);
            e.HasIndex(x => x.Sku).IsUnique();
            e.HasIndex(x => new { x.ProductId, x.Size, x.Color }).IsUnique();
            e.Property(x => x.Version).IsRowVersion();
            e.ToTable(t => t.HasCheckConstraint("CK_ProductVariant_Stock", "\"Stock\" >= 0"));
            e.HasQueryFilter(x => x.Product.DeletedAt == null);
            e.Ignore(x => x.EffectivePrice);
        });

        b.Entity<ProductImage>(e =>
        {
            e.Property(x => x.StorageKey).HasMaxLength(200);
            e.Property(x => x.ThumbKey).HasMaxLength(200);
            e.Property(x => x.Alt).HasMaxLength(200);
            e.HasIndex(x => new { x.ProductId, x.SortOrder });
        });

        b.Entity<Order>(e =>
        {
            e.Property(x => x.OrderNumber).HasMaxLength(20);
            e.HasIndex(x => x.OrderNumber).IsUnique();
            e.HasIndex(x => x.CreatedAt).IsDescending();
            e.HasIndex(x => x.Status);
            e.Property(x => x.CustomerName).HasMaxLength(80);
            e.Property(x => x.Phone).HasMaxLength(20);
            e.Property(x => x.City).HasMaxLength(60);
            e.Property(x => x.Address).HasMaxLength(300);
            e.Property(x => x.Notes).HasMaxLength(500);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(12);
            e.Property(x => x.PaymentMethod).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.Version).IsRowVersion();
            e.HasMany(x => x.Items).WithOne().HasForeignKey(i => i.OrderId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(x => x.History).WithOne().HasForeignKey(h => h.OrderId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<OrderItem>(e =>
        {
            e.Property(x => x.TitleSnapshot).HasMaxLength(140);
            e.Property(x => x.SizeSnapshot).HasMaxLength(20);
            e.Property(x => x.ColorSnapshot).HasMaxLength(40);
            e.ToTable(t => t.HasCheckConstraint("CK_OrderItem_Quantity", "\"Quantity\" > 0"));
            e.HasOne<Product>().WithMany().HasForeignKey(x => x.ProductId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<ProductVariant>().WithMany().HasForeignKey(x => x.VariantId).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<OrderStatusEvent>(e =>
        {
            e.Property(x => x.FromStatus).HasConversion<string>().HasMaxLength(12);
            e.Property(x => x.ToStatus).HasConversion<string>().HasMaxLength(12);
            e.Property(x => x.Note).HasMaxLength(500);
            e.HasOne<AppUser>().WithMany().HasForeignKey(x => x.ChangedByUserId).OnDelete(DeleteBehavior.SetNull);
        });

        b.Entity<Guide>(e =>
        {
            e.Property(x => x.Slug).HasMaxLength(160);
            e.HasIndex(x => x.Slug).IsUnique();
            e.Property(x => x.Title).HasMaxLength(160);
            e.Property(x => x.Type).HasMaxLength(20);
            e.Property(x => x.Excerpt).HasMaxLength(300);
            e.Property(x => x.Body).HasMaxLength(40000);
            e.Property(x => x.CoverKey).HasMaxLength(300);
            e.Property(x => x.Video).HasMaxLength(60);
            e.Property(x => x.Source).HasMaxLength(500);
            e.Property(x => x.RelatedProductIds).HasColumnType("integer[]");
            e.Property(x => x.Version).IsRowVersion();                       // xmin
            e.HasIndex(x => new { x.IsPublished, x.SortOrder });
        });

        b.Entity<Faq>(e =>
        {
            e.Property(x => x.Q).HasMaxLength(200);
            e.Property(x => x.A).HasMaxLength(2000);
            e.HasIndex(x => new { x.IsPublished, x.SortOrder });
        });

        b.Entity<Testimonial>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(80);
            e.Property(x => x.Bike).HasMaxLength(80);
            e.Property(x => x.Quote).HasMaxLength(600);
            e.ToTable(t => t.HasCheckConstraint("CK_Testimonial_Rating", "\"Rating\" BETWEEN 1 AND 5"));
            e.HasIndex(x => new { x.IsPublished, x.SortOrder });
        });

        b.Entity<AuditEntry>(e =>
        {
            e.Property(x => x.UserId).HasMaxLength(450);
            e.Property(x => x.UserEmail).HasMaxLength(256);
            e.Property(x => x.Action).HasMaxLength(40);
            e.Property(x => x.Entity).HasMaxLength(40);
            e.Property(x => x.EntityId).HasMaxLength(40);
            e.Property(x => x.Summary).HasMaxLength(1000);
            e.Property(x => x.Ip).HasMaxLength(45);
            e.HasIndex(x => new { x.Entity, x.EntityId });
            e.HasIndex(x => x.At).IsDescending();
        });

        b.Entity<Setting>(e =>
        {
            e.HasKey(x => x.Key);
            e.Property(x => x.Key).HasMaxLength(40);
            e.Property(x => x.Value).HasColumnType("jsonb");
        });
    }
}
