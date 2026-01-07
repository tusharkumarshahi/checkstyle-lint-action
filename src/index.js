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

    logHeader('Checkstyle Analysis Starting');
    core.info(`📋 Configuration: ${checkstyleConfig}`);
    core.info(`🎯 Thresholds: Errors=${maxErrors}, Warnings=${maxWarnings}`);
    core.info(`⚡ Check only diff: ${checkOnlyDiff ? 'Yes (faster)' : 'No (full scan)'}`);
    core.info('');

    // Get changed files if checking only diff
    let filesToCheck = null;
    if (checkOnlyDiff && github.context.eventName === 'pull_request') {
      filesToCheck = await getChangedFiles(token);
      core.info(`📁 Found ${filesToCheck.length} changed Java files to analyze`);
      core.info('');
    }

    // Run Checkstyle
    await runCheckstyle(checkstyleConfig);

    // Parse results
    const results = await parseCheckstyleResults('target/checkstyle-result.xml', filesToCheck);

    // Categorize issues
    const categorizedIssues = categorizeIssues(results.violations);
    const topFiles = getTopFiles(results.violations);

    // Log enhanced summary
    logEnhancedSummary(results, categorizedIssues, topFiles, maxErrors, maxWarnings);

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
      await createEnhancedPRComment(
        token,
        results,
        categorizedIssues,
        topFiles,
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

      logSeparator();
      const message = failureMessages.join('\n');
      
      if (failOnError) {
        core.setFailed(message);
      } else {
        core.warning(message);
      }
    } else {
      logSeparator();
      core.info('✅ All quality checks passed!');
      core.info('🎉 Code meets the configured quality standards');
    }

  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
  }
}

function logHeader(title) {
  core.info('');
  core.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  core.info(`🔍 ${title}`);
  core.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  core.info('');
}

function logSeparator() {
  core.info('');
  core.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  core.info('');
}

function logEnhancedSummary(results, categorizedIssues, topFiles, maxErrors, maxWarnings) {
  logHeader('Checkstyle Results Summary');

  // Summary stats
  core.info(`📁 Files Analyzed:     ${results.filesChecked}`);
  core.info('');
  core.info('Issues by Severity:');
  core.info(`  ❌ Errors:           ${results.errorCount}`);
  core.info(`  ⚠️  Warnings:        ${results.warningCount}`);
  core.info(`  ℹ️  Info:            ${results.infoCount}`);
  core.info('');

  // Status
  const totalIssues = results.errorCount + results.warningCount;
  if (totalIssues === 0) {
    core.info('✅ Status: PASSED - No issues found!');
  } else if (results.errorCount > maxErrors || results.warningCount > maxWarnings) {
    core.info('❌ Status: FAILED - Exceeds quality thresholds');
  } else {
    core.info('✅ Status: PASSED - Within acceptable limits');
  }
  core.info(`📊 Threshold: ${maxErrors} errors / ${maxWarnings} warnings allowed`);
  
  // Issue categories
  if (categorizedIssues.length > 0) {
    core.info('');
    core.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    core.info('📋 Top Issues Found:');
    core.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    core.info('');
    categorizedIssues.slice(0, 5).forEach((cat, index) => {
      core.info(`  ${index + 1}. ${cat.category} (${cat.count} occurrences)`);
    });
  }

  // Top files
  if (topFiles.length > 0) {
    core.info('');
    core.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    core.info('📁 Most Problematic Files:');
    core.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    core.info('');
    topFiles.slice(0, 5).forEach((file, index) => {
      const shortName = file.name.split('/').slice(-1)[0];
      const padding = ' '.repeat(Math.max(1, 30 - shortName.length));
      core.info(`  ${index + 1}. ${shortName}${padding}(${file.count} issues)`);
    });
  }

  // Quick fixes
  if (totalIssues > 0) {
    core.info('');
    core.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    core.info('💡 Quick Fix Suggestions:');
    core.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    core.info('');
    
    const suggestions = generateQuickFixes(categorizedIssues);
    suggestions.forEach(suggestion => {
      core.info(`  • ${suggestion}`);
    });
    
    core.info('');
    core.info('📖 Run locally: mvn checkstyle:check');
    core.info('🔧 Auto-fix some issues: Configure your IDE with Google Java Style');
  }

  core.info('');
  core.info('🔗 Detailed report will be posted as PR comment');
}

function categorizeIssues(violations) {
  const categories = {};

  violations.forEach(v => {
    const category = extractCategory(v.message);
    if (!categories[category]) {
      categories[category] = 0;
    }
    categories[category]++;
  });

  return Object.entries(categories)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

function extractCategory(message) {
  // Categorize based on message content
  if (message.includes('Javadoc')) return 'Missing Javadoc comments';
  if (message.includes('import') && message.includes('.*')) return 'Wildcard imports';
  if (message.includes('import') && message.includes('order')) return 'Import order violations';
  if (message.includes('indentation')) return 'Indentation issues';
  if (message.includes('Line is longer')) return 'Line length violations';
  if (message.includes('name')) return 'Naming convention violations';
  if (message.includes('brace')) return 'Brace style issues';
  if (message.includes('whitespace')) return 'Whitespace issues';
  if (message.includes('modifier')) return 'Modifier order issues';
  return 'Other style violations';
}

function getTopFiles(violations) {
  const fileCounts = {};

  violations.forEach(v => {
    const shortName = v.file.split('/').slice(-1)[0];
    if (!fileCounts[shortName]) {
      fileCounts[shortName] = { name: shortName, fullPath: v.file, count: 0 };
    }
    fileCounts[shortName].count++;
  });

  return Object.values(fileCounts)
    .sort((a, b) => b.count - a.count);
}

function generateQuickFixes(categorizedIssues) {
  const suggestions = [];
  const topIssues = categorizedIssues.slice(0, 3);

  topIssues.forEach(issue => {
    switch (issue.category) {
      case 'Missing Javadoc comments':
        suggestions.push('Add Javadoc comments to public classes and methods');
        suggestions.push('Use /** */ for Javadoc, not // or /* */');
        break;
      case 'Wildcard imports':
        suggestions.push('Replace wildcard imports (.*) with explicit imports');
        suggestions.push('Most IDEs can optimize imports automatically');
        break;
      case 'Import order violations':
        suggestions.push('Organize imports: java.*, javax.*, then third-party');
        suggestions.push('Run "Organize Imports" in your IDE');
        break;
      case 'Indentation issues':
        suggestions.push('Use 2 spaces for indentation (Google Style)');
        suggestions.push('Configure your IDE to match Checkstyle rules');
        break;
      case 'Line length violations':
        suggestions.push('Keep lines under 100 characters');
        suggestions.push('Break long lines at logical points');
        break;
      case 'Naming convention violations':
        suggestions.push('Use camelCase for methods and variables');
        suggestions.push('Use PascalCase for class names');
        break;
    }
  });

  // Add general suggestions
  if (suggestions.length === 0) {
    suggestions.push('Review Checkstyle violations and fix systematically');
    suggestions.push('Consider using an IDE formatter with Google Java Style');
  }

  return suggestions.slice(0, 5); // Return max 5 suggestions
}

async function getChangedFiles(token) {
  try {
    const octokit = github.getOctokit(token);
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      pull_number: github.context.payload.pull_request.number
    });

    return files
      .filter(file => file.filename.endsWith('.java'))
      .map(file => file.filename);
  } catch (error) {
    core.warning(`Could not get changed files: ${error.message}`);
    return null;
  }
}

async function runCheckstyle(configLocation) {
  core.info('⚙️  Running Checkstyle analysis...');
  
  try {
    await exec.exec('mvn', [
      'checkstyle:checkstyle',
      `-Dcheckstyle.config.location=${configLocation}`,
      '-Dcheckstyle.consoleOutput=false',
      '--batch-mode'
    ]);
  } catch (error) {
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

async function createEnhancedPRComment(token, results, categorizedIssues, topFiles, passed, maxErrors, maxWarnings, checkOnlyDiff) {
  try {
    const octokit = github.getOctokit(token);
    const context = github.context;

    let commentBody = '## 🔍 Checkstyle Lint Report\n\n';

    // Status badge
    if (passed) {
      commentBody += '### ✅ All quality checks passed!\n\n';
      commentBody += '> 🎉 Your code meets the configured quality standards.\n\n';
    } else {
      commentBody += '### ❌ Code quality issues found\n\n';
      commentBody += '> ⚠️ Please address the issues below before merging.\n\n';
    }

    // Summary table with visual indicators
    commentBody += '#### 📊 Summary\n\n';
    commentBody += '| Metric | Count | Threshold | Status |\n';
    commentBody += '|--------|-------|-----------|--------|\n';
    commentBody += `| Errors | **${results.errorCount}** | ${maxErrors} | ${results.errorCount <= maxErrors ? '✅' : '❌'} |\n`;
    commentBody += `| Warnings | **${results.warningCount}** | ${maxWarnings} | ${results.warningCount <= maxWarnings ? '✅' : '⚠️'} |\n`;
    commentBody += `| Info | ${results.infoCount} | - | ℹ️ |\n`;
    commentBody += `| Files Checked | ${results.filesChecked} | - | 📁 |\n\n`;

    if (checkOnlyDiff) {
      commentBody += '> 📝 **Fast Mode**: Only changed files were analyzed\n\n';
    }

    // Issue categories
    if (categorizedIssues.length > 0) {
      commentBody += '#### 📋 Issues by Category\n\n';
      commentBody += '<details>\n';
      commentBody += '<summary>Click to expand issue breakdown</summary>\n\n';
      commentBody += '| Category | Count | Severity |\n';
      commentBody += '|----------|-------|----------|\n';
      
      categorizedIssues.slice(0, 10).forEach(cat => {
        const icon = cat.category.includes('Javadoc') ? '📝' : 
                     cat.category.includes('import') ? '📦' : 
                     cat.category.includes('indentation') ? '↹' : 
                     cat.category.includes('Line') ? '📏' : '🔧';
        commentBody += `| ${icon} ${cat.category} | ${cat.count} | ${cat.count > 20 ? '🔴 High' : cat.count > 10 ? '🟡 Medium' : '🟢 Low'} |\n`;
      });
      
      commentBody += '\n</details>\n\n';
    }

    // Top problematic files
    if (topFiles.length > 0 && topFiles[0].count > 0) {
      commentBody += '#### 📁 Files Needing Attention\n\n';
      commentBody += '<details>\n';
      commentBody += '<summary>Click to see which files have the most issues</summary>\n\n';
      commentBody += '| Rank | File | Issues | Priority |\n';
      commentBody += '|------|------|--------|----------|\n';
      
      topFiles.slice(0, 10).forEach((file, index) => {
        const priority = file.count > 20 ? '🔴 High' : file.count > 10 ? '🟡 Medium' : '🟢 Low';
        commentBody += `| ${index + 1} | \`${file.name}\` | ${file.count} | ${priority} |\n`;
      });
      
      commentBody += '\n</details>\n\n';
    }

    // Sample violations
    if (results.violations.length > 0) {
      const errors = results.violations.filter(v => v.severity === 'error').slice(0, 5);
      const warnings = results.violations.filter(v => v.severity === 'warning').slice(0, 5);

      commentBody += '#### 🔎 Sample Issues\n\n';
      commentBody += '<details>\n';
      commentBody += '<summary>Click to see example violations</summary>\n\n';

      if (errors.length > 0) {
        commentBody += '**❌ Errors** (must fix):\n\n';
        commentBody += '| File | Line | Issue |\n';
        commentBody += '|------|------|-------|\n';
        errors.forEach(v => {
          const shortFile = v.file.split('/').slice(-2).join('/');
          const shortMsg = v.message.length > 60 ? v.message.substring(0, 60) + '...' : v.message;
          commentBody += `| \`${shortFile}\` | ${v.line} | ${shortMsg} |\n`;
        });
        commentBody += '\n';
      }

      if (warnings.length > 0) {
        commentBody += '**⚠️ Warnings** (should fix):\n\n';
        commentBody += '| File | Line | Issue |\n';
        commentBody += '|------|------|-------|\n';
        warnings.forEach(v => {
          const shortFile = v.file.split('/').slice(-2).join('/');
          const shortMsg = v.message.length > 60 ? v.message.substring(0, 60) + '...' : v.message;
          commentBody += `| \`${shortFile}\` | ${v.line} | ${shortMsg} |\n`;
        });
        commentBody += '\n';
      }

      const remaining = results.violations.length - 10;
      if (remaining > 0) {
        commentBody += `\n_... and ${remaining} more issues. Check annotations in the Files tab._\n`;
      }

      commentBody += '\n</details>\n\n';
    }

    // Quick fixes
    const suggestions = generateQuickFixes(categorizedIssues);
    if (suggestions.length > 0) {
      commentBody += '#### 💡 Quick Fixes\n\n';
      commentBody += '<details>\n';
      commentBody += '<summary>Click for suggestions to resolve common issues</summary>\n\n';
      suggestions.forEach(suggestion => {
        commentBody += `- ${suggestion}\n`;
      });
      commentBody += '\n**Local Testing:**\n';
      commentBody += '```bash\n';
      commentBody += 'mvn checkstyle:check\n';
      commentBody += '```\n\n';
      commentBody += '</details>\n\n';
    }

    // Help section
    commentBody += '<details>\n';
    commentBody += '<summary>📖 Code Quality Guidelines</summary>\n\n';
    commentBody += '| Severity | Meaning | Action Required |\n';
    commentBody += '|----------|---------|------------------|\n';
    commentBody += '| ❌ Error | Critical issue | Must fix before merge |\n';
    commentBody += '| ⚠️ Warning | Style violation | Should fix, may be acceptable |\n';
    commentBody += '| ℹ️ Info | Suggestion | Optional improvement |\n\n';
    commentBody += '**Resources:**\n';
    commentBody += '- [Google Java Style Guide](https://google.github.io/styleguide/javaguide.html)\n';
    commentBody += '- [Checkstyle Documentation](https://checkstyle.org/)\n';
    commentBody += '- [Common Violations](https://checkstyle.org/checks.html)\n\n';
    commentBody += '</details>\n\n';

    commentBody += '---\n';
    commentBody += `_Generated by [Checkstyle Lint Action](https://github.com/${context.repo.owner}/checkstyle-lint-action) • `;
    commentBody += `Analyzed ${results.filesChecked} files in ${checkOnlyDiff ? 'fast' : 'full'} mode_`;

    // Post comment
    await octokit.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: context.payload.pull_request.number,
      body: commentBody
    });

    core.info('✅ Enhanced PR comment created successfully');
  } catch (error) {
    core.warning(`Failed to create PR comment: ${error.message}`);
  }
}

function createAnnotations(violations) {
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
    core.info(`📋 Showing first 10 annotations out of ${violations.length} total issues`);
  }
}

run();