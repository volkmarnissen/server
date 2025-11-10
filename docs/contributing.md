# Contributing to modbus2mqtt

Thank you for your interest in contributing to modbus2mqtt! This guide will help you get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Contributing Specifications](#contributing-specifications)

## Code of Conduct

Please be respectful and constructive in all interactions with the community.

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/server.git
   cd server
   ```
3. Add the upstream repository:
   ```bash
   git remote add upstream https://github.com/modbus2mqtt/server.git
   ```

## Development Setup

### Prerequisites

- Node.js 20 or higher
- npm or yarn
- Git
- VS Code (recommended)

### Install Dependencies

```bash
npm install
npm run install-hooks
```

The `install-hooks` command sets up pre-commit hooks that automatically format code with Prettier.

### Using VS Code Devcontainer

For a consistent development environment:

1. Install Docker and the "Dev Containers" extension in VS Code
2. Open the project in VS Code
3. Press `F1` and select "Dev Containers: Reopen in Container"
4. Wait for the container to build and install dependencies

All required tools and extensions will be automatically configured.

### Build the Project

```bash
npm run build.dev
```

## Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/my-new-feature
```

Branch naming conventions:
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `test/` - Test additions or fixes
- `refactor/` - Code refactoring

### 2. Make Your Changes

Follow the [coding standards](#coding-standards) below.

### 3. Test Your Changes

```bash
# Run unit tests
npm test

# Run specific test file
npm test __tests__/server/bus_test.tsx

# Run E2E tests
npm run e2e:start
npm run cypress:open
```

### 4. Commit Your Changes

Commits are automatically formatted by the pre-commit hook.

```bash
git add .
git commit -m "feat: add new feature description"
```

Commit message format:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `test:` - Test changes
- `refactor:` - Code refactoring
- `chore:` - Maintenance tasks

### 5. Push to Your Fork

```bash
git push origin feature/my-new-feature
```

### 6. Open a Pull Request

1. Go to the original repository on GitHub
2. Click "New Pull Request"
3. Select your branch
4. Fill in the PR template with:
   - Description of changes
   - Related issue numbers
   - Testing performed
   - Screenshots (if UI changes)

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Enable strict type checking
- Document public APIs with JSDoc comments

### Code Style

- Code is automatically formatted with Prettier on commit
- Run manually: `npm run prettier`
- Configuration: `.prettierrc`

### Linting

- ESLint is configured for the project
- Run: `npm run lint` (if configured)
- Fix automatically: `npm run lint -- --fix`

### Naming Conventions

- **Files**: Use kebab-case for files: `modbus-cache.ts`
- **Classes**: Use PascalCase: `ModbusCache`
- **Functions/Variables**: Use camelCase: `getSpecification`
- **Constants**: Use UPPER_SNAKE_CASE: `MAX_RETRIES`
- **Interfaces**: Prefix with `I`: `IModbusSpecification`

### Project Structure

```
src/
├── server/           # Backend server code
├── server.shared/    # Shared types for server
├── specification/    # Specification handling
├── specification.shared/ # Shared specification types
└── angular/          # Frontend Angular code

__tests__/           # Test files
├── server/          # Server tests
└── specification/   # Specification tests
```

## Testing

### Unit Tests (Jest)

Write tests for all new features and bug fixes:

```typescript
import { expect, it, describe } from '@jest/globals'

describe('MyFeature', () => {
  it('should do something', () => {
    // Arrange
    const input = 'test'
    
    // Act
    const result = myFunction(input)
    
    // Assert
    expect(result).toBe('expected')
  })
})
```

### E2E Tests (Cypress)

Add E2E tests for UI changes:

```typescript
describe('My Feature', () => {
  it('should interact correctly', () => {
    cy.visit('/my-feature')
    cy.get('[data-testid="my-button"]').click()
    cy.contains('Expected Result')
  })
})
```

### Test Coverage

Aim for:
- Unit test coverage > 80%
- All critical paths tested
- Edge cases covered

## Submitting Changes

### Pull Request Checklist

Before submitting:

- [ ] Code builds without errors: `npm run build`
- [ ] All tests pass: `npm test`
- [ ] Code is formatted: `npm run prettier`
- [ ] Commit messages follow convention
- [ ] Documentation updated (if needed)
- [ ] Changelog updated (for significant changes)

### Review Process

1. Automated checks run on your PR
2. Maintainers review your code
3. Address review feedback
4. Once approved, your PR will be merged

### After Merge

1. Delete your feature branch:
   ```bash
   git branch -d feature/my-new-feature
   git push origin --delete feature/my-new-feature
   ```

2. Update your local main branch:
   ```bash
   git checkout main
   git pull upstream main
   ```

## Contributing Specifications

Specifications define how to communicate with Modbus devices.

### Create a New Specification

1. Use the Web UI: `http://localhost:3000`
2. Navigate to "Specifications" → "Create New"
3. Fill in device details:
   - Name and manufacturer
   - Modbus registers
   - Data types and conversions
   - MQTT topics

### Test Your Specification

1. Add test data in the specification
2. Connect to a real device (if available)
3. Verify all entities read correctly
4. Document any quirks or special requirements

### Submit Your Specification

1. Export the specification from the UI
2. Create a PR with:
   - Specification YAML file
   - Documentation (README in `specifications/` folder)
   - Images or datasheets (if available)
   - Test results

### Specification Guidelines

- Use clear, descriptive names
- Include manufacturer and model information
- Document all entities thoroughly
- Add identification rules when possible
- Include links to official documentation

## Getting Help

- **Issues**: [GitHub Issues](https://github.com/modbus2mqtt/server/issues)
- **Discussions**: [GitHub Discussions](https://github.com/modbus2mqtt/server/discussions)
- **Documentation**: Check the `docs/` folder

## Recognition

Contributors will be acknowledged in:
- `CREDITS.md` file
- Release notes
- Project documentation

Thank you for contributing to modbus2mqtt! 🎉
