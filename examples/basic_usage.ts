/**
 * @file basic_usage.ts
 * @description Basic usage example for @aidevtool/ci
 */

import { CIRunner, CLIParser, Logger } from "@aidevtool/ci";

// Example 1: Basic programmatic usage
async function basicExample() {
  console.log("=== Basic Example ===");
  
  // Parse some example arguments
  const config = CLIParser.parse(["--debug", "--batch-size", "10"]);
  
  // Create logger
  const logger = new Logger(config.debug, config.silent);
  
  // Create and run CI
  const runner = new CIRunner(config, logger);
  const success = await runner.run();
  
  console.log(`CI completed: ${success ? "SUCCESS" : "FAILED"}`);
  return success;
}

// Example 2: Custom configuration
async function customConfigExample() {
  console.log("\n=== Custom Configuration Example ===");
  
  // Create custom configuration
  const customConfig = {
    singleFileMode: false,
    batchMode: true,
    legacyMode: false,
    fallbackToSingleFile: true,
    batchSize: 5,
    debug: true,
    silent: false,
    errorFilesOnly: false,
  };
  
  // Create logger with custom settings
  const logger = new Logger(true, false); // debug=true, silent=false
  
  // Run CI with custom config
  const runner = new CIRunner(customConfig, logger);
  const success = await runner.run();
  
  console.log(`Custom CI completed: ${success ? "SUCCESS" : "FAILED"}`);
  return success;
}

// Example 3: Using individual components
async function componentsExample() {
  console.log("\n=== Individual Components Example ===");
  
  // Use individual components
  const { Logger, ProcessRunner, FileSystem } = await import("@aidevtool/ci");
  
  // Logger example
  const logger = new Logger(true, false);
  logger.info("Starting component examples");
  logger.debug("This is a debug message");
  logger.warn("This is a warning");
  
  // File system example
  try {
    const testFiles = await FileSystem.findTestFiles(["./"], "*_test.ts");
    logger.info(`Found ${testFiles.length} test files`);
    if (testFiles.length > 0) {
      logger.info(`First test file: ${testFiles[0]}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Could not find test files: ${message}`);
  }
  
  // Process runner example
  try {
    const result = await ProcessRunner.run("deno", ["--version"]);
    if (result.success) {
      logger.info("Deno version check successful");
      logger.debug(`Deno version: ${result.stdout.trim()}`);
    } else {
      logger.error("Deno version check failed");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Process execution failed: ${message}`);
  }
}

// Main execution
if (import.meta.main) {
  try {
    await basicExample();
    await customConfigExample();
    await componentsExample();
    
    console.log("\n=== All examples completed ===");
  } catch (error) {
    console.error("Example failed:", error);
    Deno.exit(1);
  }
}
