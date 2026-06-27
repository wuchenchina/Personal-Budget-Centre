namespace BudgetCentre.PdfRenderer.Theme;

public static class ThemeRegistry
{
    public static PdfTheme ForKey(string? key)
    {
        return (key ?? "classic").Trim().ToLowerInvariant() switch
        {
            "statement_red" => StatementRedTheme.Create(),
            "civic_blue" => CivicBlueTheme.Create(),
            _ => ClassicTheme.Create(),
        };
    }
}
