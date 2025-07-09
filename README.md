# @aidevtool/ci

[![JSR](https://jsr.io/badges/@aidevtool/ci)](https://jsr.io/@aidevtool/ci)
[![GitHub](https://img.shields.io/github/license/aidevtool/deno-local-ci)](https://github.com/aidevtool/deno-local-ci/blob/main/LICENSE)

A comprehensive TypeScript-based CI runner for Deno projects with robust testing, formatting, and
linting capabilities.

## Features

- **Multiple Execution Modes**: Single-file, batch, and legacy modes for different project needs
- **Type Safety**: Full TypeScript support with strict type checking
- **Comprehensive Reporting**: Detailed error reporting and diagnostics
- **Flexible Configuration**: Customizable batch sizes and execution options
- **Error Handling**: Structured error categorization and fallback mechanisms
- **Rich Logging**: Multiple log levels with debug and silent modes
- **Performance Optimized**: Memory-efficient processing for large test suites

## Installation

### Using JSR (Recommended)

```bash
# Run directly
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci

# Or install for reuse
deno add @aidevtool/ci
```

### Using GitHub

```bash
deno run --allow-read --allow-write --allow-run --allow-env https://raw.githubusercontent.com/aidevtool/deno-local-ci/main/mod.ts
```

## Usage

### Basic Usage

```bash
# Run with default settings
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci

# Run in single-file mode with debug output
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --single-file --debug

# Run in batch mode with custom batch size
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --batch --batch-size 15

# Run in legacy mode (all tests at once)
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --legacy
```

### Programmatic Usage

```typescript
import { CIRunner, CLIParser, Logger } from "@aidevtool/ci";

// Parse command line arguments
const config = CLIParser.parse(Deno.args);

// Initialize logger
const logger = new Logger(config.debug, config.silent);

// Create and run CI
const runner = new CIRunner(config, logger);
const success = await runner.run();

Deno.exit(success ? 0 : 1);
```

### Using Individual Components

```typescript
import { FileSystem, Logger, ProcessRunner } from "@aidevtool/ci";

// Use logger
const logger = new Logger(true, false); // debug=true, silent=false
logger.info("Starting CI process");

// Use process runner
const processRunner = new ProcessRunner();
const result = await processRunner.run("deno", ["test", "example.test.ts"]);

// Use file system utilities
const fileSystem = new FileSystem();
const testFiles = await fileSystem.findTestFiles("./tests");
```

## Command Line Options

- `--single-file`: Run tests one file at a time in debug mode
- `--batch`: Run tests in batches (default behavior)
- `--batch-size N`: Set batch size (default: 25)
- `--legacy`: Use legacy mode (all tests at once)
- `--no-fallback`: Disable automatic fallback to single-file mode
- `--debug`: Enable debug logging
- `--help, -h`: Show help message

## Environment Variables

- `DEBUG=true`: Enable debug logging
- `LOG_LEVEL=debug`: Enable debug logging

## Architecture

The CI runner is organized into modular components:

- **CIRunner**: Main orchestration class managing the complete CI pipeline
- **Logger**: Structured logging with multiple levels and output modes
- **ProcessRunner**: Async process execution with timeout and error handling
- **FileSystem**: File discovery and path utilities
- **CLIParser**: Command-line argument parsing and validation

## Performance

- **Memory Efficient**: Optimized for large test suites with configurable batch processing
- **Fallback Mechanisms**: Automatic fallback to single-file mode on batch failures
- **Resource Detection**: System resource detection for optimal batch sizing
- **Real-time Output**: Live progress reporting and error diagnostics

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Make your changes and add tests
4. Run the CI: `deno task ci`
5. Commit your changes: `git commit -am 'Add new feature'`
6. Push to the branch: `git push origin feature/new-feature`
7. Submit a pull request

## Development

```bash
# Install dependencies and run checks
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

## License

MIT License - see the [LICENSE](LICENSE) file for details.

## Links

- [JSR Package](https://jsr.io/@aidevtool/ci)
- [GitHub Repository](https://github.com/aidevtool/deno-local-ci)
- [Issues](https://github.com/aidevtool/deno-local-ci/issues)
- [Documentation](https://jsr.io/@aidevtool/ci/doc)
