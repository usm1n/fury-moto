using GearDoctor.Application.Common;

namespace GearDoctor.Application.Admin;

/// <summary>STUB — implemented by the Phase 2/3 admin API agent. Registered in DependencyInjection.cs.</summary>
public sealed class DashboardService(IAppDbContext db)
{
    private readonly IAppDbContext _db = db;
}
