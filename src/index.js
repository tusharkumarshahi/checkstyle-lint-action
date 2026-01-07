const core = require('@actions/core');
const github = require('@actions/github');
const exec = require('@actions/exec');
const fs = require('fs');
const { parseString } = require('xml2js');
const { promisify } = require('util');

const parseXml = promisify(parseString);

async function run() {
  try {
    // Get inputs
    const checkstyleConfig = core.getInput('checkstyle-config');
    const maxErrors = parseInt(core.getInput('max-errors'));
    const maxWarnings = parseInt(core.getInput('max-warnings'));
    const failOnError = core.getInput('fail-on-error') === 'true';
    const checkOnlyDiff = core.getInput('check-only-diff') === 'true';
    const sourceDir = core.getInput('source-directory');
    const token = core.getInput('github-token');

    core.info('🔍 Starting Checkstyle Analysis');
    core.info(`Configuration: ${checkstyleConfig}`);
    core.info(`Thresholds: Errors=${maxErrors}, Warnings=${maxWarnings}`);
    core.info(`Check only diff: ${checkOnlyDiff}`);

    // Get changed files if checking only diff
    let filesToCheck = null;
    if (checkOnlyDiff && github.context.eventName === 'pull_request') {
      filesToCheck = await getChangedFiles(token);
      core.info(`Found ${filesToCheck.length} changed Java files`);
    }

    // Run Checkstyle
    await runCheckstyle(checkstyleConfig);

    // Parse results
    const results = await parseCheckstyleResults('target/checkstyle-result.xml', filesToCheck);

    // Log summary
    core.info('');
    core.info('📊 Checkstyle Results:');
    core.info(`  Files Checked: ${results.filesChecked}`);
    core.info(`  Errors: ${results.errorCount}`);
    core.info(`  Warnings: ${results.warningCount}`);
    core.info(`  Info: ${results.infoCount}`);
    core.info('');

    // Set outputs
    core.setOutput('error-count', results.errorCount);
    core.setOutput('warning-count', results.warningCount);
    core.setOutput('info-count', results.infoCount);
    core.setOutput('files-checked', results.filesChecked);

    // Determine pass/fail
    const errorsExceeded = results.errorCount > maxErrors;
    const warningsExceeded = results.warningCount > maxWarnings;
    const passed = !errorsExceeded && !warningsExceeded;

    core.setOutput('passed', passed);

    // Create PR comment if this is a PR
    if (github.context.eventName === 'pull_request') {
      await createPRComment(
        token,
        results,
        passed,
        maxErrors,
        maxWarnings,
        checkOnlyDiff
      );
    }

    // Create annotations for violations
    if (results.violations.length > 0) {
      createAnnotations(results.violations);
    }

    // Final status
    if (!passed) {
      const failureMessages = [];
      
      if (errorsExceeded) {
        failureMessages.push(`❌ Errors: ${results.errorCount} (max: ${maxErrors})`);
      }
      
      if (warningsExceeded) {
        failureMessages.push(`⚠️  Warnings: ${results.warningCount} (max: ${maxWarnings})`);
      }

      const message = failureMessages.join('\n');
      
      if (failOnError) {
        core.setFailed(message);
      } else {
        core.warning(message);
      }
    } else {
      core.info('✅ All quality checks passed!');
    }

  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
  }
}

async function getChangedFiles(token) {
  try {
    const octokit = github.getOctokit(token);
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      pull_number: github.context.payload.pull_request.number
    });

    // Filter only Java files
    return files
      .filter(file => file.filename.endsWith('.java'))
      .map(file => file.filename);
  } catch (error) {
    core.warning(`Could not get changed files: ${error.message}`);
    return null;
  }
}

async function runCheckstyle(configLocation) {
  core.info('Running Checkstyle via Maven...');
  
  try {
    await exec.exec('mvn', [
      'checkstyle:checkstyle',
      `-Dcheckstyle.config.location=${configLocation}`,
      '-Dcheckstyle.consoleOutput=false',
      '--batch-mode'
    ]);
  } catch (error) {
    // Checkstyle might return non-zero even on success with violations
    core.debug('Checkstyle execution completed');
  }
}

async function parseCheckstyleResults(filePath, filesToCheck) {
  if (!fs.existsSync(filePath)) {
    throw new Error('Checkstyle result file not found. Ensure Maven Checkstyle plugin is configured in pom.xml');
  }

  const xmlContent = fs.readFileSync(filePath, 'utf-8');
  const result = await parseXml(xmlContent);

  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  const violations = [];
  const filesChecked = new Set();

  if (result.checkstyle && result.checkstyle.file) {
    for (const file of result.checkstyle.file) {
      const fileName = file.$.name;
      
      // Skip if checking only diff and this file isn't in the diff
      if (filesToCheck && !filesToCheck.some(f => fileName.includes(f))) {
        continue;
      }

      filesChecked.add(fileName);
      
      if (file.error) {
        for (const error of file.error) {
          const severity = error.$.severity || 'info';
          const line = error.$.line;
          const column = error.$.column || '1';
          const message = error.$.message;
          const source = error.$.source || '';

          violations.push({
            file: fileName,
            line: parseInt(line),
            column: parseInt(column),
            severity: severity,
            message: message,
            source: source
          });

          if (severity === 'error') {
            errorCount++;
          } else if (severity === 'warning') {
            warningCount++;
          } else {
            infoCount++;
          }
        }
      }
    }
  }

  return {
    errorCount,
    warningCount,
    infoCount,
    violations,
    filesChecked: filesChecked.size
  };
}

async function createPRComment(token, results, passed, maxErrors, maxWarnings, checkOnlyDiff) {
  try {
    const octokit = github.getOctokit(token);
    const context = github.context;

    // Create comment body
    let commentBody = '## 🔍 Checkstyle Lint Report\n\n';

    if (passed) {
      commentBody += '### ✅ All quality checks passed!\n\n';
    } else {
      commentBody += '### ❌ Code quality issues found\n\n';
    }

    // Summary table
    commentBody += '| Metric | Count | Threshold | Status |\n';
    commentBody += '|--------|-------|-----------|--------|\n';
    commentBody += `| Errors | ${results.errorCount} | ${maxErrors} | ${results.errorCount <= maxErrors ? '✅' : '❌'} |\n`;
    commentBody += `| Warnings | ${results.warningCount} | ${maxWarnings} | ${results.warningCount <= maxWarnings ? '✅' : '⚠️'} |\n`;
    commentBody += `| Info | ${results.infoCount} | - | ℹ️ |\n`;
    commentBody += `| Files Checked | ${results.filesChecked} | - | 📁 |\n\n`;

    if (checkOnlyDiff) {
      commentBody += '> 📝 Only changed files were checked (faster analysis)\n\n';
    }

    // Top violations by severity
    if (results.violations.length > 0) {
      const errors = results.violations.filter(v => v.severity === 'error').slice(0, 5);
      const warnings = results.violations.filter(v => v.severity === 'warning').slice(0, 5);

      commentBody += '<details>\n';
      commentBody += '<summary>📋 Issues Found (click to expand)</summary>\n\n';

      if (errors.length > 0) {
        commentBody += '#### ❌ Errors\n\n';
        commentBody += '| File | Line | Message |\n';
        commentBody += '|------|------|----------|\n';
        for (const v of errors) {
          const shortFile = v.file.split('/').slice(-2).join('/');
          commentBody += `| \`${shortFile}\` | ${v.line} | ${v.message} |\n`;
        }
        commentBody += '\n';
      }

      if (warnings.length > 0) {
        commentBody += '#### ⚠️ Warnings\n\n';
        commentBody += '| File | Line | Message |\n';
        commentBody += '|------|------|----------|\n';
        for (const v of warnings) {
          const shortFile = v.file.split('/').slice(-2).join('/');
          commentBody += `| \`${shortFile}\` | ${v.line} | ${v.message} |\n`;
        }
        commentBody += '\n';
      }

      const remaining = results.violations.length - 10;
      if (remaining > 0) {
        commentBody += `\n_... and ${remaining} more issues_\n`;
      }

      commentBody += '\n</details>\n\n';
    }

    // Guidelines
    commentBody += '<details>\n';
    commentBody += '<summary>📖 Code Quality Guidelines</summary>\n\n';
    commentBody += '**Error**: Must be fixed before merge\n';
    commentBody += '**Warning**: Should be fixed, may be acceptable in some cases\n';
    commentBody += '**Info**: Suggestions for improvement\n\n';
    commentBody += 'For more details, check the [Checkstyle documentation](https://checkstyle.org/)\n';
    commentBody += '</details>\n\n';

    commentBody += '---\n';
    commentBody += '_Generated by [Checkstyle Lint Action](https://github.com/YOUR-USERNAME/checkstyle-lint-action)_';

    // Post comment
    await octokit.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: context.payload.pull_request.number,
      body: commentBody
    });

    core.info('✅ PR comment created successfully');
  } catch (error) {
    core.warning(`Failed to create PR comment: ${error.message}`);
  }
}

function createAnnotations(violations) {
  // GitHub Actions supports max 10 annotations per run
  const topViolations = violations.slice(0, 10);
  
  for (const v of topViolations) {
    const level = v.severity === 'error' ? 'error' : 'warning';
    const message = `[Checkstyle ${v.severity}] ${v.message}`;
    
    if (level === 'error') {
      core.error(message, {
        file: v.file,
        startLine: v.line,
        startColumn: v.column,
        title: 'Checkstyle Error'
      });
    } else {
      core.warning(message, {
        file: v.file,
        startLine: v.line,
        startColumn: v.column,
        title: 'Checkstyle Warning'
      });
    }
  }
  
  if (violations.length > 10) {
    core.info(`Note: Showing first 10 annotations. Total issues: ${violations.length}`);
  }
}

run();
