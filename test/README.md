# Integration Tests

This directory contains integration tests for the cbmonitor project.

## Test Structure

### Unit Tests
Unit tests are located alongside the code they test:
- `cmd/config-manager/main_test.go` - Tests for config-manager main function
- `cmd/grafana-app/main_test.go` - Tests for grafana-app main function
- `internal/config-manager/api/handlers_test.go` - Tests for API handlers
- `internal/config-manager/storage/file_test.go` - Tests for file storage
- `internal/grafana-app/dashboards/couchbase_test.go` - Tests for dashboard components
- `internal/grafana-app/backend/couchbase_test.go` - Tests for backend services
- `pkg/config/config_test.go` - Tests for shared configuration utilities

### Integration Tests
Integration tests are located in this directory:
- `config_manager_integration_test.go` - Tests for config-manager service
- `grafana_app_integration_test.go` - Tests for grafana-app service
- `end_to_end_test.go` - End-to-end tests for complete workflows
- `test_helpers.go` - Common test utilities and helpers

## Running Tests

### Unit Tests
```bash
# Run all unit tests
go test ./...

# Run tests for specific package
go test ./cmd/config-manager
go test ./internal/config-manager/api
```

### Integration Tests
```bash
# Run integration tests
go test ./test

# Run specific integration test
go test ./test -run TestConfigManagerServiceIntegration
```

### All Tests
```bash
# Run all tests including integration tests
make test
```

## Test Categories

### 1. Config Manager Integration Tests
- Service startup and health checks
- API endpoint functionality
- Scrape target lifecycle management
- File storage operations
- Configuration persistence

### 2. Grafana App Integration Tests
- App initialization and loading
- Dashboard definition loading
- Backend service functionality
- Plugin integration
- Real-time data updates

### 3. End-to-End Tests
- Complete workflow testing
- Service communication
- Data consistency across services
- System resilience and recovery
- Performance under load

### 4. User Scenario Tests
- Typical user workflows
- Error handling and recovery
- Edge cases and boundary conditions
- Usability and user experience

## Test Data

The `test_helpers.go` file provides:
- `TestHelper` struct for common testing operations
- `TestData` structures for test data
- Helper functions for service health checks
- Utilities for creating and cleaning up test data

## Test Environment

Tests expect the following environment:
- Config Manager service running on `localhost:8080`
- Grafana App service running on `localhost:3001`
- Test data directory with appropriate permissions
- Network connectivity for service communication

## Writing New Tests

When adding new tests:

1. **Unit Tests**: Add to the appropriate package alongside the code
2. **Integration Tests**: Add to this directory with descriptive names
3. **Test Helpers**: Add common utilities to `test_helpers.go`
4. **Documentation**: Update this README with new test categories

## Test Implementation Status

All tests are currently placeholders with TODO comments. As you implement the actual functionality, replace the placeholder tests with real implementations.

### Next Steps
1. Implement the actual service functionality
2. Replace placeholder tests with real test implementations
3. Add test data and fixtures
4. Set up CI/CD pipeline for automated testing 