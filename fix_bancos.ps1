$path = 'd:\Proyectos\erp-mya\src\pages\Bancos\CuentasBancarias.tsx'
$content = [System.IO.File]::ReadAllText($path)
$startMarker = '        {esVistaDepositos ? ('
$start = $content.IndexOf($startMarker)
$kpi = $content.IndexOf('<div className="bn-kpis">', $start)
$end = $content.LastIndexOf('          <>', $kpi)
Write-Host "start=$start kpi=$kpi end=$end"
