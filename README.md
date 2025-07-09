# @aidevtool/ci

[![JSR](https://jsr.io/badges/@aidevtool/ci)](https://jsr.io/@aidevtool/ci)
[![GitHub](https://img.shields.io/github/license/tettuan/deno-local-ci)](https://github.com/tettuan/deno-local-ci/blob/main/LICENSE)
[![Tests](https://github.com/tettuan/deno-local-ci/actions/workflows/ci.yml/badge.svg)](https://github.com/tettuan/deno-local-ci/actions/workflows/ci.yml)

A comprehensive TypeScript-based CI runner for Deno projects with robust testing, formatting,
linting, and type checking capabilities. Built with Domain-Driven Design principles and strong type
safety.

## ✨ Features

- 🔄 **Complete CI Pipeline**: Type check → JSR check → Test → Lint → Format
- 🎯 **Multiple Execution Modes**: Single-file, batch, and all modes for different project needs
- 🛡️ **Type Safety**: Full TypeScript support with strict type checking
- 📊 **Comprehensive Reporting**: Detailed error reporting and diagnostics with structured logging
- ⚙️ **Flexible Configuration**: Customizable batch sizes, log modes, and execution options
- 🔧 **Error Handling**: Structured error categorization and intelligent fallback mechanisms
- 📝 **Rich Logging**: Multiple log levels with debug, silent modes, and BreakdownLogger integration
- ⚡ **Performance Optimized**: Memory-efficient processing for large test suites
- 🏗️ **Domain-Driven Design**: Clean architecture with separated concerns and modular components

## 🚀 Installation

### Using JSR (Recommended)

```bash
# Run directly without installation
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci

# Or add to your project
deno add @aidevtool/ci
```

### Using GitHub

```bash
deno run --allow-read --allow-write --allow-run --allow-env https://raw.githubusercontent.com/tettuan/deno-local-ci/main/mod.ts
```

## 📖 Usage

### Command Line Interface

```bash
# Run with default settings (batch mode)
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci

# Run in single-file mode with debug output
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci \
  --mode single-file --log-mode debug

# Run in batch mode with custom batch size
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci \
  --mode batch --batch-size 15

# Run all files at once (legacy mode)
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci \
  --mode all

# Run in silent mode (minimal output)
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci \
  --log-mode silent

# Run with BreakdownLogger integration for detailed debugging
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci \
  --log-mode debug --log-key CI_DEBUG --log-length M
```

### Programmatic Usage

```typescript
import { CILogger, CIRunner, CLIParser, LogModeFactory, main } from "@aidevtool/ci";

// Simple usage - run CI with default settings
await main(["--mode", "batch"]);

// Advanced usage - full control over CI configuration
const parseResult = CLIParser.parseArgs(["--mode", "single-file", "--log-mode", "debug"]);
if (parseResult.ok) {
  const configResult = CLIParser.buildCIConfig(parseResult.data);
  if (configResult.ok) {
    const config = configResult.data;
    const logMode = config.logMode || LogModeFactory.normal();
    const loggerResult = CILogger.create(logMode, config.breakdownLoggerConfig);

    if (loggerResult.ok) {
      const logger = loggerResult.data;
      const runnerResult = await CIRunner.create(logger, config, Deno.cwd());

      if (runnerResult.ok) {
        const runner = runnerResult.data;
        const result = await runner.run();
        console.log(result.success ? "✅ CI passed" : "❌ CI failed");
      }
    }
  }
}
```

### Using Individual Components

```typescript
import {
  CILogger,
  FileSystemService,
  LogModeFactory,
  ProcessRunner,
  ProjectFileDiscovery,
} from "@aidevtool/ci";

// Use logger with different modes
const debugMode = LogModeFactory.debug();
const loggerResult = CILogger.create(debugMode);
if (loggerResult.ok) {
  const logger = loggerResult.data;
  logger.logInfo("Starting custom CI process");
}

// Use process runner for command execution
const processRunner = new ProcessRunner();
const result = await processRunner.run("deno", ["test", "example.test.ts"]);
console.log(`Process result: ${result.success}`);

// Use file system utilities
const fileSystem = new FileSystemService();
const discovery = new ProjectFileDiscovery(fileSystem);
const projectFiles = await discovery.discoverProjectFiles("./src");
console.log(`Found ${projectFiles.testFiles.length} test files`);
```

## 🔧 Command Line Options

| Option                       | Description                                                   | Default           |
| ---------------------------- | ------------------------------------------------------------- | ----------------- |
| `--mode <mode>`              | Execution mode: `single-file`, `batch`, or `all`              | `batch`           |
| `--batch-size <size>`        | Number of files per batch (1-100)                             | `25`              |
| `--log-mode <mode>`          | Logging mode: `normal`, `silent`, `error-files-only`, `debug` | `normal`          |
| `--log-key <key>`            | BreakdownLogger key for debug mode                            | -                 |
| `--log-length <length>`      | BreakdownLogger length: `S`, `M`, `L`                         | `M`               |
| `--working-directory <path>` | Working directory for CI execution                            | Current directory |
| `--no-fallback`              | Disable automatic fallback to single-file mode                | `false`           |
| `--help, -h`                 | Show help message                                             | -                 |
| `--version, -v`              | Show version information                                      | -                 |

## 🎯 CI Pipeline Stages

The CI runner executes the following stages in order:

1. **Type Check** - Validates TypeScript types across the project
2. **JSR Compatibility Check** - Ensures JSR package compatibility (dry-run only)
3. **Test Execution** - Runs all test files with proper isolation
4. **Lint Check** - Validates code style and catches potential issues
5. **Format Check** - Ensures consistent code formatting

Each stage must pass before proceeding to the next. On failure, the pipeline stops and reports
detailed error information.

## 📊 Execution Modes

### Single-File Mode (`--mode single-file`)

- Executes tests one file at a time
- Maximum isolation and detailed error reporting
- Best for debugging specific test failures
- Slower but most reliable

### Batch Mode (`--mode batch`) - Default

- Processes files in configurable batches
- Balances performance with error isolation
- Automatically falls back to single-file mode on batch failures
- Optimal for most projects

### All Mode (`--mode all`)

- Runs all tests in a single execution
- Fastest execution but less error isolation
- Best for simple projects or final validation
- Falls back to batch mode on failures

## 🔍 Logging Modes

### Normal Mode (Default)

- Standard output with progress indicators
- Stage completion notifications
- Error summaries and file lists

### Silent Mode (`--log-mode silent`)

- Minimal output
- Only critical errors and final results
- Perfect for CI/CD environments

### Error Files Only Mode (`--log-mode error-files-only`)

- Shows only files that contain errors
- Compact error reporting
- Good for quick issue identification

### Debug Mode (`--log-mode debug`)

- Detailed execution information
- BreakdownLogger integration with timestamps
- Full configuration and state logging
- Ideal for troubleshooting

## 🌍 Environment Variables

- `DEBUG=true` - Enable debug logging (alternative to `--log-mode debug`)
- `LOG_LEVEL=debug` - Enable debug logging
- `CI_LOCAL_*` - BreakdownLogger environment variables (when using debug mode)

## 🏗️ Architecture

The CI runner follows Domain-Driven Design principles with clear separation of concerns:

### Core Components

- **`CIRunner`** - Main orchestration class managing the complete CI pipeline
- **`CIPipelineOrchestrator`** - Manages stage execution flow and dependencies
- **`CILogger`** - Structured logging with multiple modes and BreakdownLogger integration
- **`ProcessRunner`** - Async process execution with timeout and error handling
- **`FileSystemService`** - File discovery and path utilities with type classification
- **`CLIParser`** - Command-line argument parsing and validation

### Domain Services

- **`ExecutionStrategyService`** - Determines optimal execution strategies based on project
  characteristics
- **`ErrorClassificationService`** - Categorizes and analyzes CI errors for appropriate handling
- **`StageInternalFallbackService`** - Implements intelligent fallback logic between execution modes
- **`FileClassificationService`** - Classifies project files by type and purpose

### Infrastructure Layer

- **`DenoCommandRunner`** - Deno-specific command execution and environment management
- **`ProjectFileDiscovery`** - Discovers and categorizes project files across directories
- **`BreakdownLoggerEnvConfig`** - Configuration management for enhanced debugging

## ⚡ Performance Features

### Intelligent Batching

- **Configurable Batch Sizes**: Optimize for your system resources (1-100 files per batch)
- **Memory Efficiency**: Processes large test suites without memory exhaustion
- **Resource Detection**: Automatically adjusts batch sizes based on system capabilities

### Fallback Mechanisms

- **Automatic Fallback**: Seamlessly falls back from batch to single-file mode on failures
- **Error-Specific Handling**: Different fallback strategies based on error types
- **Progressive Degradation**: Maintains functionality even when optimal strategies fail

### Real-time Feedback

- **Live Progress Reporting**: See CI progress as it happens
- **Immediate Error Feedback**: Get error details as soon as they're detected
- **Stage-by-Stage Results**: Clear visibility into each pipeline stage

## 🛡️ Error Handling

### Error Classification

- **Type Check Errors**: TypeScript compilation and type validation issues
- **Test Failures**: Runtime test failures with detailed stack traces
- **JSR Compatibility Issues**: Package compatibility and publishing validation
- **Lint Violations**: Code style and quality issues
- **Format Inconsistencies**: Code formatting violations

### Fallback Strategies

```typescript
// Automatic fallback flow
All Mode → Batch Mode → Single-File Mode → Detailed Error Report
```

### Error Reporting

- Structured error messages with context
- File-specific error isolation
- Aggregated error summaries
- Actionable recommendations for fixes

## 🧪 Testing & Quality

This package includes comprehensive test coverage:

- **64 Tests** covering all components and integration scenarios
- **Unit Tests** for individual components and services
- **Integration Tests** for complete CI pipeline flows
- **Type Safety Tests** ensuring robust TypeScript integration
- **Error Scenario Tests** validating fallback mechanisms

Run tests locally:

```bash
deno test --allow-read --allow-write --allow-run --allow-env
```

## 📋 Development Workflow

### Local Development

```bash
# Clone the repository
git clone https://github.com/tettuan/deno-local-ci.git
cd deno-local-ci

# Run CI on the project itself
deno task ci

# Run tests
deno task test

# Format code
deno task fmt

# Lint code
deno task lint

# Type check
deno task check
```

### Available Tasks

| Task        | Command               | Description               |
| ----------- | --------------------- | ------------------------- |
| `ci`        | `deno task ci`        | Run full CI pipeline      |
| `ci-debug`  | `deno task ci-debug`  | Run CI with debug logging |
| `ci-silent` | `deno task ci-silent` | Run CI in silent mode     |
| `ci-batch`  | `deno task ci-batch`  | Run CI in batch mode      |
| `ci-all`    | `deno task ci-all`    | Run CI in all mode        |
| `test`      | `deno task test`      | Run test suite            |
| `fmt`       | `deno task fmt`       | Format code               |
| `lint`      | `deno task lint`      | Lint code                 |
| `check`     | `deno task check`     | Type check                |

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes** with comprehensive tests
4. **Run the CI pipeline**: `deno task ci`
5. **Commit your changes**: `git commit -am 'Add amazing feature'`
6. **Push to the branch**: `git push origin feature/amazing-feature`
7. **Submit a pull request**

### Development Guidelines

- Maintain strong TypeScript typing
- Follow Domain-Driven Design principles
- Add comprehensive test coverage
- Update documentation for new features
- Ensure all CI stages pass

## 📄 License

MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- **[JSR Package](https://jsr.io/@aidevtool/ci)** - Official package registry
- **[GitHub Repository](https://github.com/tettuan/deno-local-ci)** - Source code and issues
- **[Documentation](https://jsr.io/@aidevtool/ci/doc)** - API documentation
- **[Issues](https://github.com/tettuan/deno-local-ci/issues)** - Bug reports and feature requests
- **[Releases](https://github.com/tettuan/deno-local-ci/releases)** - Version history and changelogs

---

**Built with ❤️ for the Deno community**
