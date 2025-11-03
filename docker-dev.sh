#!/bin/bash

# Docker Development Environment Manager for Django Celery Scraper
# This script provides convenient commands for managing the containerized development environment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if Docker is running
check_docker() {
    if ! docker info >/dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
}

# Function to check if environment file exists
check_env_file() {
    if [ ! -f .env ]; then
        if [ -f .env.example ]; then
            print_warning ".env file not found. Copying from .env.example..."
            cp .env.example .env
            print_status "Please review and update .env file with your settings"
            print_status "For proxy support, add your BrightData credentials to .env"
        else
            print_error ".env file not found and no .env.example available"
            exit 1
        fi
    fi
}

# Function to show usage
show_usage() {
    echo "Docker Development Environment Manager"
    echo "====================================="
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  build           Build all containers"
    echo "  up              Start all services in background"
    echo "  down            Stop all services"
    echo "  restart         Restart all services"
    echo "  logs            Show logs for all services"
    echo "  logs [service]  Show logs for specific service"
    echo "  shell           Open shell in web container"
    echo "  manage [cmd]    Run Django management command"
    echo "  test            Run tests in container"
    echo "  clean           Clean up containers and volumes"
    echo "  reset           Full reset (networks, containers, system cleanup)"
    echo "  status          Show status of all services"
    echo "  dev             Start development environment with logs"
    echo "  prod            Start production environment"
    echo ""
    echo "Examples:"
    echo "  $0 dev                    # Start development environment"
    echo "  $0 logs worker            # Show worker logs"
    echo "  $0 manage migrate         # Run Django migrations"
    echo "  $0 shell                  # Open shell in web container"
}

# Build containers
build_containers() {
    print_status "Building containers..."
    docker-compose build
    print_success "Containers built successfully"
}

# Start services
start_services() {
    print_status "Starting services..."
    docker-compose up -d
    print_success "Services started successfully"

    print_status "Waiting for services to be healthy..."
    sleep 10

    print_status "Service status:"
    docker-compose ps
}

# Stop services
stop_services() {
    print_status "Stopping services..."
    docker-compose down --remove-orphans
    print_success "Services stopped"
}

# Restart services
restart_services() {
    print_status "Restarting services..."
    docker-compose restart
    print_success "Services restarted"
}

# Show logs
show_logs() {
    if [ -n "$1" ]; then
        print_status "Showing logs for $1..."
        docker-compose logs -f "$1"
    else
        print_status "Showing logs for all services..."
        docker-compose logs -f
    fi
}

# Open shell
open_shell() {
    print_status "Opening shell in web container..."
    docker-compose exec web bash
}

# Run Django management command
run_manage() {
    if [ -z "$1" ]; then
        print_error "Please specify a Django management command"
        exit 1
    fi

    print_status "Running Django management command: $*"
    docker-compose exec web python manage.py "$@"
}

# Run tests
run_tests() {
    print_status "Running tests..."
    docker-compose exec web python -m pytest
}

# Clean up
cleanup() {
    print_warning "This will remove all containers, networks, and volumes"
    read -p "Are you sure? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Cleaning up..."
        docker-compose down -v --remove-orphans
        docker system prune -f
        print_success "Cleanup completed"
    else
        print_status "Cleanup cancelled"
    fi
}

# Show status
show_status() {
    print_status "Container status:"
    docker-compose ps
    echo ""
    print_status "Resource usage:"
    docker stats --no-stream
}

# Start development environment
start_dev() {
    print_status "Starting development environment..."
    check_env_file

    # Clean up any orphaned networks first
    print_status "Cleaning up orphaned resources..."
    docker-compose down --remove-orphans 2>/dev/null || true
    docker network prune -f 2>/dev/null || true

    # Start without Tailwind initially to avoid the import error
    print_status "Starting core services..."
    docker-compose up --build postgres redis mongodb web proxy worker beat -d

    print_status "Waiting for core services to be healthy..."
    sleep 15

    print_status "Core services status:"
    docker-compose ps

    # Note about Tailwind
    print_warning "Tailwind service has known import issues - CSS is pre-built during Docker build"
    print_status "Your application is ready at http://localhost:8000"
    print_status "Services available:"
    print_status "  - Django Admin: http://localhost:8000/admin/"
    print_status "  - Proxy Service: http://localhost:8001/docs"
    print_status "  - PostgreSQL: localhost:5432"
    print_status "  - Redis: localhost:6379"
    print_status "  - MongoDB: localhost:27017"
}

# Start production environment
start_prod() {
    print_status "Starting production environment..."

    if [ ! -f .env.prod ]; then
        print_error ".env.prod file not found. Please create it for production deployment."
        exit 1
    fi

    docker-compose -f docker-compose.prod.yml up -d --build
    print_success "Production environment started"
}

# Main script logic
check_docker

case "$1" in
    build)
        check_env_file
        build_containers
        ;;
    up)
        check_env_file
        start_services
        ;;
    down)
        stop_services
        ;;
    restart)
        restart_services
        ;;
    logs)
        show_logs "$2"
        ;;
    shell)
        open_shell
        ;;
    manage)
        shift
        run_manage "$@"
        ;;
    test)
        run_tests
        ;;
    clean)
        cleanup
        ;;
    reset)
        print_status "Performing full reset (stops containers, cleans networks, rebuilds)..."
        docker-compose down --remove-orphans 2>/dev/null || true
        docker network prune -f 2>/dev/null || true
        docker system prune -f 2>/dev/null || true
        print_success "Reset completed. Run '$0 dev' to start fresh."
        ;;
    status)
        show_status
        ;;
    dev)
        start_dev
        ;;
    prod)
        start_prod
        ;;
    ""|help)
        show_usage
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        show_usage
        exit 1
        ;;
esac
