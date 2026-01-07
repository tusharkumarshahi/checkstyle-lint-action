# Adoption Guide: Checkstyle Lint Action

This guide explains how other teams can adopt and use the Checkstyle Lint Action in their repositories.

---

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Prerequisites](#prerequisites)
3. [Step-by-Step Setup](#step-by-step-setup)
4. [Configuration Options](#configuration-options)
5. [Making it a Required Check](#making-it-a-required-check)
6. [Troubleshooting](#troubleshooting)
7. [Best Practices](#best-practices)

---

## 🚀 Quick Start

**Time to adopt: 10-15 minutes**

For a Java Maven project, you need:
1. Add Maven Checkstyle plugin to `pom.xml`
2. Create workflow file using this action
3. (Optional) Make it a required status check

---

## ✅ Prerequisites

### Your Repository Must Have:

1. **Java project** (Maven or Gradle)
2. **Source code** in `src/main/java` (or specify custom path)
3. **GitHub Actions enabled** in repository settings

### What You'll Need:

- Access to repository settings (for branch protection)
- Basic understanding of YAML syntax
- 10 minutes of time

---

## 📖 Step-by-Step Setup

### Step 1: Add Checkstyle Plugin to Your Project

#### For Maven Projects:

Add this to your `pom.xml` inside the `<build><plugins>` section:

```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-checkstyle-plugin</artifactId>
    <version>3.3.1</version>
    <configuration>
        <configLocation>${checkstyle.config.location}</configLocation>
        <outputFile>target/checkstyle-result.xml</outputFile>
        <consoleOutput>false</consoleOutput>
        <failsOnError>false</failsOnError>
    </configuration>
</plugin>
```

#### For Gradle Projects:

Add this to your `build.gradle`:

```gradle
plugins {
    id 'checkstyle'
}

checkstyle {
    toolVersion = '10.12.0'
    configFile = file("config/checkstyle/checkstyle.xml")
}
```

**Test it works:**
```bash
# Maven
mvn checkstyle:checkstyle

# Gradle
./gradlew checkstyleMain
```

---

### Step 2: Create Workflow File

Create `.github/workflows/lint-check.yml` in your repository:

```yaml
name: Code Quality - Lint Check

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main, develop]

jobs:
  checkstyle:
    name: Checkstyle Analysis
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Set up JDK
        uses: actions/setup-java@v4
        with:
          java-version: '17'  # Change to your Java version
          distribution: 'temurin'
          cache: 'maven'      # Or 'gradle'
      
      - name: Run Checkstyle Lint
        uses: YOUR-USERNAME/checkstyle-lint-action@v1
        with:
          checkstyle-config: 'google_checks.xml'
          max-errors: 0
          max-warnings: 10
          fail-on-error: true
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

**Important:** Replace `YOUR-USERNAME` with the actual GitHub username/org!

---

### Step 3: Test the Workflow

```bash
# Commit and push
git add .github/workflows/lint-check.yml pom.xml
git commit -m "feat: add checkstyle linting workflow"
git push origin main

# Create a test PR
git checkout -b test/linting
echo "public class Test{}" > src/main/java/Test.java
git add .
git commit -m "test: add file to test linting"
git push origin test/linting

# Create PR
gh pr create --title "Test linting" --body "Testing checkstyle action"
```

**Expected result:**
- Workflow runs automatically
- Finds style issues in `Test.java`
- Posts comment on PR
- Check appears in PR status

---

### Step 4: Make It a Required Check (Recommended)

This ensures PRs cannot be merged if linting fails.

#### Via GitHub UI:

1. Go to **Repository Settings** → **Branches**
2. Find your default branch (`main`)
3. Click **Add rule** or **Edit** existing rule
4. Check **Require status checks to pass before merging**
5. Search for and select: **Checkstyle Analysis**
6. Check **Require branches to be up to date**
7. Click **Save changes**

#### Via GitHub API:

```bash
# Get current protection settings
gh api repos/:owner/:repo/branches/main/protection

# Update with required checks
gh api repos/:owner/:repo/branches/main/protection/required_status_checks \
  --method PATCH \
  --field "contexts[]=Checkstyle Analysis"
```

**Test it works:**
- Try to merge PR with linting failures → Should be blocked ❌
- Fix issues, push again → Should allow merge ✅

---

## ⚙️ Configuration Options

### Basic Configuration

```yaml
- uses: YOUR-USERNAME/checkstyle-lint-action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

Uses defaults: Google style, 0 errors, 10 warnings allowed

### Strict Configuration

```yaml
- uses: YOUR-USERNAME/checkstyle-lint-action@v1
  with:
    checkstyle-config: 'google_checks.xml'
    max-errors: 0
    max-warnings: 0      # No warnings allowed
    fail-on-error: true
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Lenient Configuration (Legacy Codebases)

```yaml
- uses: YOUR-USERNAME/checkstyle-lint-action@v1
  with:
    checkstyle-config: 'sun_checks.xml'
    max-errors: 10
    max-warnings: 100
    fail-on-error: false  # Just warn, don't block
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Fast Mode (Check Only Changed Files)

```yaml
- uses: YOUR-USERNAME/checkstyle-lint-action@v1
  with:
    check-only-diff: true  # Only check PR changes
    max-errors: 0
    max-warnings: 5
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Custom Checkstyle Configuration

```yaml
- uses: YOUR-USERNAME/checkstyle-lint-action@v1
  with:
    checkstyle-config: './config/custom-checkstyle.xml'
    max-errors: 0
    max-warnings: 10
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

### All Options

| Input | Description | Default |
|-------|-------------|---------|
| `checkstyle-config` | Config file path | `google_checks.xml` |
| `max-errors` | Max errors allowed | `0` |
| `max-warnings` | Max warnings allowed | `10` |
| `fail-on-error` | Block PR if exceeded | `true` |
| `check-only-diff` | Check only changed files | `false` |
| `source-directory` | Source directory | `src/main/java` |
| `github-token` | GitHub token | `${{ github.token }}` |

---

## 🔒 Making it a Required Check

### Why Make It Required?

Without making it required:
- ❌ Developers can merge PRs with linting failures
- ❌ Code quality degrades over time
- ❌ Inconsistent code style across team

With required check:
- ✅ Enforces code quality standards
- ✅ Prevents bad code from entering codebase
- ✅ Automated enforcement (no manual review needed)

### GitHub Branch Protection Rules

**Step-by-step:**

1. **Settings** → **Branches** → **Branch protection rules**

2. **Add rule** for `main` branch

3. **Enable these settings:**
   - ✅ Require status checks to pass before merging
   - ✅ Status checks: Select "Checkstyle Analysis"
   - ✅ Require branches to be up to date
   - (Optional) Require pull request reviews

4. **Save changes**

**Now PRs with linting failures cannot be merged!**

### Testing Required Check

```bash
# 1. Create PR with bad code
git checkout -b test/required-check
echo "public class bad{}" > src/main/java/Bad.java
git add .
git commit -m "test: bad code"
git push origin test/required-check
gh pr create

# 2. Try to merge
gh pr merge --squash
# Expected: Error - "Required status check not passed"

# 3. Fix issues
echo "public class Bad {}" > src/main/java/Bad.java
git add .
git commit -m "fix: proper code style"
git push

# 4. Try to merge again
gh pr merge --squash
# Expected: Success!
```

---

## 🐛 Troubleshooting

### Problem: "Checkstyle result file not found"

**Cause:** Maven Checkstyle plugin not configured

**Solution:**
```xml
<!-- Add to pom.xml -->
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-checkstyle-plugin</artifactId>
    <version>3.3.1</version>
    <configuration>
        <configLocation>google_checks.xml</configLocation>
        <outputFile>target/checkstyle-result.xml</outputFile>
    </configuration>
</plugin>
```

### Problem: "Too many violations"

**Cause:** Legacy codebase with existing issues

**Solution:** Gradual adoption
```yaml
# Week 1: Very lenient
max-errors: 100
max-warnings: 500

# Week 4: Less lenient
max-errors: 50
max-warnings: 200

# Week 8: Moderate
max-errors: 10
max-warnings: 50

# Week 12: Strict
max-errors: 0
max-warnings: 10
```

### Problem: "Workflow doesn't run on PR"

**Cause:** Trigger not configured

**Solution:**
```yaml
on:
  pull_request:      # ← Make sure this exists
    branches: [main]
```

### Problem: "Can't merge even though check passed"

**Cause:** Wrong check name in branch protection

**Solution:**
- Check name must exactly match workflow job name
- In our example: "Checkstyle Analysis"
- Case-sensitive!

---

## 📚 Best Practices

### 1. Start Lenient, Get Stricter

```yaml
# Month 1
max-warnings: 100

# Month 2
max-warnings: 50

# Month 3
max-warnings: 10

# Goal
max-warnings: 0
```

### 2. Use Check-Only-Diff for Large Codebases

```yaml
check-only-diff: true  # Much faster
```

Only checks files changed in PR, not entire codebase.

### 3. Different Rules for Different Environments

```yaml
# development.yml - Lenient
max-warnings: 20

# production.yml - Strict
max-warnings: 0
```

### 4. Document Your Style Guide

Create `STYLE_GUIDE.md`:
```markdown
# Code Style Guide

We use Google Java Style:
- Indentation: 2 spaces
- Line length: 100 characters
- Class names: PascalCase
- Method names: camelCase

See: https://google.github.io/styleguide/javaguide.html
```

### 5. Educate Team

- Share Checkstyle documentation
- Explain why code quality matters
- Show examples of good/bad code
- Be patient during adoption

---

## 📊 Adoption Checklist

Use this checklist for onboarding:

### Pre-Adoption
- [ ] Review current codebase quality
- [ ] Run Checkstyle locally: `mvn checkstyle:checkstyle`
- [ ] Count existing violations
- [ ] Set realistic initial thresholds

### Initial Setup (Day 1)
- [ ] Add Checkstyle plugin to `pom.xml`
- [ ] Create workflow file `.github/workflows/lint-check.yml`
- [ ] Test on a non-critical branch
- [ ] Verify PR comment appears

### Rollout (Week 1)
- [ ] Enable on all branches
- [ ] Set lenient thresholds initially
- [ ] Communicate to team
- [ ] Provide documentation link

### Enforcement (Week 2)
- [ ] Make it a required check
- [ ] Test that PRs can't merge with failures
- [ ] Help team fix issues

### Optimization (Month 1)
- [ ] Gradually reduce thresholds
- [ ] Enable `check-only-diff` if needed
- [ ] Customize Checkstyle rules if needed
- [ ] Monitor adoption metrics

---

## 🎓 Training Resources

### For Developers

- [Google Java Style Guide](https://google.github.io/styleguide/javaguide.html)
- [Checkstyle Documentation](https://checkstyle.org/)
- [Common Checkstyle Violations](https://checkstyle.org/checks.html)

### For Teams

- Share this adoption guide
- Internal lunch-and-learn session
- Code review examples
- Pair programming sessions

---

## 📞 Support

### Getting Help

1. **Check workflow logs** in Actions tab
2. **Review this guide** for common issues
3. **Check action repository** for updates
4. **Open issue** if problem persists

### Providing Feedback

- Issues: [github.com/YOUR-USERNAME/checkstyle-lint-action/issues](https://github.com/YOUR-USERNAME/checkstyle-lint-action/issues)
- Feature requests: Open an issue with "enhancement" label
- Questions: Use Discussions tab

---

## 🎯 Success Metrics

Track these to measure adoption success:

| Metric | Target | How to Measure |
|--------|--------|----------------|
| PR Check Pass Rate | >90% | GitHub Insights |
| Average Violations | <5 per PR | PR comments |
| Time to Fix Issues | <10 min | Developer feedback |
| Team Adoption | 100% | All repos using it |
| Code Quality Score | Improving | SonarQube |

---

## 🔄 Updating the Action

When action gets updates:

```yaml
# Update from v1 to v2
- uses: YOUR-USERNAME/checkstyle-lint-action@v2

# Or use latest
- uses: YOUR-USERNAME/checkstyle-lint-action@main  # Not recommended for prod
```

**Recommended:** Pin to specific version (`@v1`) for stability.

---

## ✅ Summary

**What you learned:**
1. How to add Checkstyle to your project
2. How to create workflow using the action
3. How to make it a required check
4. How to configure for different scenarios
5. How to troubleshoot common issues

**Next steps:**
1. Add to your first repository
2. Test with a PR
3. Make it required
4. Share with your team
5. Gradually improve thresholds

---

**Ready to improve your code quality?** Start with Step 1! 🚀
