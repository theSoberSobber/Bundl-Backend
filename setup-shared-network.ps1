# Check if network exists and create it if not
$networkExists = docker network ls | Select-String -Pattern "orvio-bundl-network"
if (-not $networkExists) {
    Write-Host "Creating shared Docker network 'orvio-bundl-network'..."
    docker network create orvio-bundl-network
} else {
    Write-Host "Shared network 'orvio-bundl-network' already exists."
}

Write-Host "Shared network setup complete!"
Write-Host ""
Write-Host "To start Orvio Backend:"
Write-Host "cd refrence/orvio-backend; docker-compose up -d"
Write-Host ""
Write-Host "To start Bundl Backend:"
Write-Host "docker-compose up -d"
Write-Host ""
Write-Host "Note: Start Orvio first since Bundl depends on the same Postgres/Redis services" 