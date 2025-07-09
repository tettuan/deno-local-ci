/**
 * Deno Local CI - Main Entry Point
 *
 * TypeScript-based CI runner for Deno projects
 * Domain-driven design with comprehensive testing, formatting, and linting
 */

// === Core Types ===
export type {
  CIConfig,
  CIError,
  CIStage,
  ExecutionMode,
  LogMode,
  ProcessResult,
  Result,
  StageResult,
  TestFileType,
  TestResult,
  ValidationError,
} from "./src/types.ts";

export { BreakdownLoggerEnvConfig, createError, ExecutionStrategy } from "./src/types.ts";

// === Domain Services ===
export {
  CIPipelineOrchestrator,
  ErrorClassificationService,
  ExecutionStrategyService,
  FileClassificationService,
  StageInternalFallbackService,
} from "./src/domain_services.ts";

// === Infrastructure Services ===
export { DenoCommandRunner, ProcessRunner } from "./src/process_runner.ts";

export { FileSystemService, ProjectFileDiscovery } from "./src/file_system.ts";

export { CILogger, LogModeFactory } from "./src/logger.ts";

export { type CLIOptions, CLIParser } from "./src/cli_parser.ts";

// === Core CI Runner ===
export { type CIExecutionResult, CIRunner } from "./src/ci_runner.ts";

// === CLI Interface ===
export async function main(args: string[] = Deno.args): Promise<void> {
  const { CLIParser } = await import("./src/cli_parser.ts");
  const { CILogger, LogModeFactory } = await import("./src/logger.ts");
  const { CIRunner } = await import("./src/ci_runner.ts");

  // CLI引数解析
  const parseResult = CLIParser.parseArgs(args);
  if (!parseResult.ok) {
    console.error("❌ Error parsing command line arguments:");
    console.error(`   ${parseResult.error.message}`);
    CLIParser.showHelp();
    Deno.exit(1);
  }

  const options = parseResult.data;

  // ヘルプ・バージョン表示
  if (options.help) {
    CLIParser.showHelp();
    return;
  }

  if (options.version) {
    CLIParser.showVersion();
    return;
  }

  // CI設定構築
  const configResult = CLIParser.buildCIConfig(options);
  if (!configResult.ok) {
    console.error("❌ Error building CI configuration:");
    console.error(`   ${configResult.error.message}`);
    Deno.exit(1);
  }

  const config = configResult.data;

  // ログモード設定
  const logMode = config.logMode || LogModeFactory.normal();
  const loggerResult = CILogger.create(logMode, config.breakdownLoggerConfig);
  if (!loggerResult.ok) {
    console.error("❌ Error creating logger:");
    console.error(`   ${loggerResult.error.message}`);
    Deno.exit(1);
  }

  const logger = loggerResult.data;

  // CIRunner作成
  const runnerResult = await CIRunner.create(logger, config, options.workingDirectory);
  if (!runnerResult.ok) {
    logger.logError("Failed to create CI runner", runnerResult.error.message);
    Deno.exit(1);
  }

  const runner = runnerResult.data;

  // CI実行
  logger.logDebug("Starting CI execution with configuration", config);
  const result = await runner.run();

  // 結果に基づく終了コード
  if (result.success) {
    logger.logDebug("CI execution completed successfully");
    Deno.exit(0);
  } else {
    logger.logError("CI execution failed", result.errorDetails);
    Deno.exit(1);
  }
}

// モジュールが直接実行された場合はmainを実行
if (import.meta.main) {
  await main();
}
