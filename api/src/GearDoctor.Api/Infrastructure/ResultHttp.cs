using GearDoctor.Application.Common;

namespace GearDoctor.Api.Infrastructure;

/// <summary>Maps service Results to HTTP. Every error becomes RFC 9457 ProblemDetails.</summary>
public static class ResultHttp
{
    public static IResult ToHttp<T>(this Result<T> r, Func<T, IResult>? ok = null) =>
        r.IsSuccess ? (ok?.Invoke(r.Value!) ?? Results.Ok(r.Value)) : r.Error!.ToProblem();

    public static IResult ToHttp(this Result r, Func<IResult>? ok = null) =>
        r.IsSuccess ? (ok?.Invoke() ?? Results.NoContent()) : r.Error!.ToProblem();

    public static IResult ToProblem(this Error e)
    {
        var status = e.Kind switch
        {
            ErrorKind.Validation => StatusCodes.Status400BadRequest,
            ErrorKind.NotFound => StatusCodes.Status404NotFound,
            ErrorKind.Conflict => StatusCodes.Status409Conflict,
            ErrorKind.Unauthorized => StatusCodes.Status401Unauthorized,
            ErrorKind.Forbidden => StatusCodes.Status403Forbidden,
            ErrorKind.Locked => StatusCodes.Status423Locked,
            ErrorKind.TooManyRequests => StatusCodes.Status429TooManyRequests,
            ErrorKind.Unprocessable => StatusCodes.Status422UnprocessableEntity,
            _ => StatusCodes.Status400BadRequest,
        };
        var ext = new Dictionary<string, object?>();
        if (e.Extensions is not null)
            foreach (var p in e.Extensions.GetType().GetProperties())
                ext[char.ToLowerInvariant(p.Name[0]) + p.Name[1..]] = p.GetValue(e.Extensions);

        return e.Errors is { Count: > 0 }
            ? Results.ValidationProblem(e.Errors.ToDictionary(k => k.Key, v => v.Value), title: e.Title, detail: e.Detail, type: e.Type, extensions: ext)
            : Results.Problem(title: e.Title, detail: e.Detail, statusCode: status, type: e.Type, extensions: ext);
    }
}
