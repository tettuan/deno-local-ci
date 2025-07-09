#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env
/**
 * @file local_ci.ts
 * @description CLI entry point for Deno Local CI with 5-stage pipeline
 * 
 * Usage:
 *   deno run --allow-all ./local_ci.ts [options]
 *   
 * Pipeline stages:
 *   1. Type Check → 2. JSR Check → 3. Test → 4. Lint → 5. Format
 *   
 * Each stage stops on error and doesn't proceed to the next stage.
 * Automatic fallback: All → Batch → Single-file (if enabled)
 */

import { TypeSafeCIRunner, parseArgsWithDefaults } from "./mod.ts";

async function main(): Promise<void> {
  try {
    // Parse command line arguments
    const configResult = parseArgsWithDefaults();
    if (!configResult.ok) {
      console.error(`❌ Configuration Error: ${configResult.error.message}`);
      console.error(`   Kind: ${configResult.error.kind}`);
      console.error(`\n💡 Use --help for usage information`);
      Deno.exit(1);
    }
    
    console.log("🚀 Deno Local CI v2.0.0 - 5-Stage Pipeline");
    console.log("📋 Pipeline: Type Check → JSR Check → Test → Lint → Format");
    console.log(`⚙️  Mode: ${configResult.data.mode.kind}`);
    console.log(`🔄 Fallback: ${configResult.data.fallbackEnabled ? "enabled" : "disabled"}`);
    console.log(`📊 Log Mode: ${configResult.data.logMode.kind}\n`);
    
    // Create CI runner
    const runnerResult = TypeSafeCIRunner.create(configResult.data);
    if (!runnerResult.ok) {
      console.error(`❌ Runner Creation Error: ${runnerResult.error.message}`);
      console.error(`   Kind: ${runnerResult.error.kind}`);
      Deno.exit(1);
    }
    
    // Run the 5-stage pipeline
    const pipelineResult = await runnerResult.data.runPipeline();
    
    if (!pipelineResult.ok) {
      console.error(`\n❌ Pipeline Failed: ${pipelineResult.error.kind}`);
      
      // Display error details based on type
      switch (pipelineResult.error.kind) {
        case "TypeCheckError":
          console.error(`📁 Affected files: ${pipelineResult.error.files.join(", ")}`);
          console.error(`📝 Details: ${pipelineResult.error.details.join("\\n")}`);
          break;
        case "TestFailure":
          console.error(`📁 Failed files: ${pipelineResult.error.files.join(", ")}`);
          console.error(`🔍 Errors: ${pipelineResult.error.errors.join("\\n")}`);
          break;
        case "JSRError":
          console.error(`📦 JSR Output: ${pipelineResult.error.output}`);
          console.error(`💡 Suggestion: ${pipelineResult.error.suggestion}`);
          break;
        case "FormatError":
          console.error(`📁 Unformatted files: ${pipelineResult.error.files.join(", ")}`);
          console.error(`🛠️  Fix command: ${pipelineResult.error.fixCommand}`);
          break;
        case "LintError":
          console.error(`📁 Linted files: ${pipelineResult.error.files.join(", ")}`);
          console.error(`📝 Details: ${pipelineResult.error.details.join("\\n")}`);
          break;
        case "ConfigurationError":
          console.error(`⚙️  Field: ${pipelineResult.error.field}`);
          console.error(`❓ Value: ${pipelineResult.error.value}`);
          break;
        case "FileSystemError":
          console.error(`💾 Operation: ${pipelineResult.error.operation}`);
          console.error(`📁 Path: ${pipelineResult.error.path}`);
          console.error(`❓ Cause: ${pipelineResult.error.cause}`);
          break;
      }
      
      console.error(`\n💡 Pipeline stopped at stage with error. Fix the issue and try again.`);
      Deno.exit(1);
    }
    
    // Success!
    const result = pipelineResult.data;
    console.log(`\n🎉 All pipeline stages completed successfully!`);
    console.log(`⏱️  Total duration: ${result.totalDuration}ms`);
    console.log(`✅ Successful stages: ${result.stages.filter(s => s.kind === "success").length}`);
    console.log(`❌ Failed stages: ${result.stages.filter(s => s.kind === "failure").length}`);
    console.log(`⏭️  Skipped stages: ${result.stages.filter(s => s.kind === "skipped").length}`);
    
    // Display stage details if in normal or debug mode
    if (configResult.data.logMode.kind === "normal" || configResult.data.logMode.kind === "debug") {
      console.log(`\n📊 Stage Details:`);
      for (const stage of result.stages) {
        if (stage.kind === "success") {
          console.log(`   ✅ ${stage.stage.kind}: ${stage.duration}ms`);
        } else if (stage.kind === "failure") {
          console.log(`   ❌ ${stage.stage.kind}: ${stage.error}`);
        } else {
          console.log(`   ⏭️  ${stage.stage.kind}: ${stage.reason}`);
        }
      }
    }
    
    Deno.exit(0);
    
  } catch (error) {
    console.error(`\n💥 Unexpected Error: ${error.message}`);
    console.error(`📍 Stack trace:`);
    console.error(error.stack);
    Deno.exit(1);
  }
}

// Handle graceful shutdown
const handleSignal = (signal: string) => {
  console.log(`\n⚠️  Received ${signal}. Shutting down gracefully...`);
  Deno.exit(130); // 128 + 2 (SIGINT)
};

// Register signal handlers
if (Deno.build.os !== "windows") {
  Deno.addSignalListener("SIGINT", () => handleSignal("SIGINT"));
  Deno.addSignalListener("SIGTERM", () => handleSignal("SIGTERM"));
}

// Run main function
if (import.meta.main) {
  await main();
}
