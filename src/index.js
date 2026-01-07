const core = require('@actions/core');
const github = require('@actions/github');
const exec = require('@actions/exec');
const fs = require('fs');
const xml2js = require('xml2js');

async function run() {
  try {
    // Get inputs
    const checkstyleConfig = core.getInput('checkstyle-config');
    const maxErrors = parseInt(core.getInput('max-errors'));
    const maxWarnings = parseInt(core.getInput('max-warnings'));
    const failOnError = core.getInput('fail-on-error') === 'true';
    const sourceDir = core.getInput('source-directory');
    const token = core.getInput('github-token');

    core.info('🔍 Starting Checkstyle analysis...');
    core.info(`Configuration: ${checkstyleConfig}`);
    core.info(`Max errors: ${maxErrors}, Max warnings: ${maxWarnings}`);

    // Run Checkstyle using Maven
    const checkstyleResultPath = 'target/checkstyle-result.xml';
    
    core.info('Running Checkstyle via Maven...');
    
    try {
      await exec.exec('mvn', [
        'checkstyle:checkstyle',
        `-Dcheckstyle.config.location=${checkstyleConfig}`,
        '-Dcheckstyle.consoleOutput=true'
      ]);
    } catch (error) {
      // Checkstyle might return non-zero even on success
      core.warning('Checkstyle execution completed with warnings');
    }

    // Check if result file exists
    if (!fs.existsSync(checkstyleResultPath)) {
      core.setFailed('Checkstyle result file not found. Ensure Maven Checkstyle plugin is configured.');
      return;
    }

    // Parse Checkstyle results
    const xmlContent = fs.readFileSync(checkstyleResultPath, 'utf-8');
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xmlContent);

    // Count errors and warnings
    let errorCount = 0;
    let warningCount = 0;
    let infoCount = 0;
    const violations = [];

    if (result.checkstyle && result.checkstyle.file) {
      for (const file of result.checkstyle.file) {
        const fileName = file.$.name;
        
        if (file.error) {
          for (const error of file.error) {
            const severity = error.$.severity;
            const line = error.$.line;
            const message = error.$.message;
            const source = error.$.source;

            violations.push({
              file: fileName,
              line: line,
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

    // Log summary
    core.info('');
    core.info('📊 Checkstyle Results:');
    core.info(`  Errors: ${errorCount}`);
    core.info(`  Warnings: ${warningCount}`);
    core.info(`  Info: ${infoCount}`);
    core.info('');

    // Set outputs
    core.setOutput('error-count', errorCount);
    core.setOutput('warning-count', warningCount);

    // Determine pass/fail
    const errorsExceeded = errorCount > maxErrors;
    const warningsExceeded = warningCount > maxWarnings;
    const passed = !errorsExceeded && !warningsExceeded;

    core.setOutput('passed', passed);

    // Create PR comment if this is a pull request
    if (github.context.eventName === 'pull_request') {
      await createPRComment(
        token,
        errorCount,
        warningCount,
        infoCount,
        violations,
        passed,
        maxErrors,
        maxWarnings
      );
    }

    // Create annotations for violations
    if (violations.length > 0) {
      createAnnotations(violations);
    }

    // Final status
    if (!passed) {
      const failureMessage = [];
      
      if (errorsExceeded) {
        failureMessage.push(`❌ Errors: ${errorCount} (max: ${maxErrors})`);
      }
      
      if (warningsExceeded) {
        failureMessage.push(`⚠️  Warnings: ${warningCount} (max: ${maxWarnings})`);
      }

      if (failOnError) {
        core.setFailed(failureMessage.join('\n'));
      } else {
        core.warning(failureMessage.join('\n'));
      }
    } else {
      core.info('✅ All checks passed!');
    }

  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
  }
}

async function createPRComment(token, errorCount, warningCount, infoCount, violations, passed, maxErrors, maxWarnings) {
  try {
    const octokit = github.getOctokit(token);
    const context = github.context;

    // Create comment body
    let commentBody = '## 🔍 Checkstyle Report\n\n';

    if (passed) {
      commentBody += '### ✅ All checks passed!\n\n';
    } else {
      commentBody += '### ❌ Quality checks failed\n\n';
    }

    commentBody += '| Metric | Count | Threshold | Status |\n';
    commentBody += '|--------|-------|-----------|--------|\n';
    commentBody += `| Errors | ${errorCount} | ${maxErrors} | ${errorCount <= maxErrors ? '✅' : '❌'} |\n`;
    commentBody += `| Warnings | ${warningCount} | ${maxWarnings} | ${warningCount <= maxWarnings ? '✅' : '⚠️'} |\n`;
    commentBody += `| Info | ${infoCount} | - | ℹ️ |\n\n`;

    // Add top violations
    if (violations.length > 0) {
      commentBody += '<details>\n';
      commentBody += '<summary>📋 Top Issues (click to expand)</summary>\n\n';
      
      const topViolations = violations.slice(0, 10);
      
      commentBody += '| File | Line | Severity | Message |\n';
      commentBody += '|------|------|----------|----------|\n';
      
      for (const v of topViolations) {
        const fileName = v.file.split('/').pop();
        const severity = v.severity === 'error' ? '❌' : v.severity === 'warning' ? '⚠️' : 'ℹ️';
        commentBody += `| ${fileName} | ${v.line} | ${severity} | ${v.message} |\n`;
      }
      
      if (violations.length > 10) {
        commentBody += `\n_... and ${violations.length - 10} more issues_\n`;
      }
      
      commentBody += '\n</details>\n\n';
    }

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
  // GitHub Actions supports max 10 annotations at a time
  const topViolations = violations.slice(0, 10);
  
  for (const v of topViolations) {
    const level = v.severity === 'error' ? 'error' : 'warning';
    const message = `[Checkstyle] ${v.message}`;
    
    if (level === 'error') {
      core.error(message, {
        file: v.file,
        startLine: parseInt(v.line),
        title: 'Checkstyle Error'
      });
    } else {
      core.warning(message, {
        file: v.file,
        startLine: parseInt(v.line),
        title: 'Checkstyle Warning'
      });
    }
  }
}

run();