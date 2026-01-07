# Checkstyle Lint Action

Custom GitHub Action to enforce Java code quality standards using Checkstyle.

## Features

- ✅ Runs Checkstyle analysis on Java code
- ✅ Configurable error and warning thresholds
- ✅ Automatic PR comments with detailed results
- ✅ Code annotations on violations
- ✅ Blocks merges when quality standards not met
- ✅ Reusable across multiple repositories

## Usage

### Basic Example

```yaml
name: Lint Check

on:
  pull_request:
    branches: [main]

jobs:
  checkstyle:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up JDK
        uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'
      
      - name: Run Checkstyle
        uses: YOUR-USERNAME/checkstyle-lint-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Advanced Configuration

```yaml
- name: Run Checkstyle
  uses: YOUR-USERNAME/checkstyle-lint-action@v1
  with:
    checkstyle-config: 'google_checks.xml'  # or sun_checks.xml
    max-errors: 0                            # Allow 0 errors
    max-warnings: 10                         # Allow up to 10 warnings
    fail-on-error: true                      # Fail build on threshold breach
    source-directory: 'src/main/java'       # Source directory to check
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `checkstyle-config` | Checkstyle configuration (google_checks.xml, sun_checks.xml, or custom path) | No | `google_checks.xml` |
| `max-errors` | Maximum errors allowed | No | `0` |
| `max-warnings` | Maximum warnings allowed | No | `10` |
| `fail-on-error` | Fail if thresholds exceeded | No | `true` |
| `source-directory` | Source directory to check | No | `src/main/java` |
| `github-token` | GitHub token for PR comments | No | `${{ github.token }}` |

## Outputs

| Output | Description |
|--------|-------------|
| `error-count` | Number of errors found |
| `warning-count` | Number of warnings found |
| `passed` | Whether check passed (true/false) |

## Prerequisites

Your Maven project must have the Checkstyle plugin configured in `pom.xml`:

```xml
<build>
  <plugins>
    <plugin>
      <groupId>org.apache.maven.plugins</groupId>
      <artifactId>maven-checkstyle-plugin</artifactId>
      <version>3.3.1</version>
      <configuration>
        <configLocation>${checkstyle.config.location}</configLocation>
        <outputFile>target/checkstyle-result.xml</outputFile>
      </configuration>
    </plugin>
  </plugins>
</build>
```

## Checkstyle Configurations

### Google Java Style

```yaml
checkstyle-config: 'google_checks.xml'
```

Common rules:
- Class names: PascalCase
- Method names: camelCase
- Indentation: 2 spaces
- Line length: 100 characters

### Sun Java Style

```yaml
checkstyle-config: 'sun_checks.xml'
```

Common rules:
- Class names: PascalCase
- Method names: camelCase
- Indentation: 4 spaces
- Line length: 80 characters

### Custom Configuration

Create a custom `checkstyle.xml` in your repository:

```yaml
checkstyle-config: './config/checkstyle.xml'
```

## Examples

### Strict Mode (No Tolerance)

```yaml
- uses: YOUR-USERNAME/checkstyle-lint-action@v1
  with:
    max-errors: 0
    max-warnings: 0
    fail-on-error: true
```

### Lenient Mode (Allow Some Issues)

```yaml
- uses: YOUR-USERNAME/checkstyle-lint-action@v1
  with:
    max-errors: 5
    max-warnings: 50
    fail-on-error: false  # Just warn, don't block
```

### Legacy Codebase (High Tolerance)

```yaml
- uses: YOUR-USERNAME/checkstyle-lint-action@v1
  with:
    max-errors: 100
    max-warnings: 500
    fail-on-error: false
```

## What the Action Does

1. **Runs Checkstyle** via Maven plugin
2. **Parses results** from XML output
3. **Counts violations** (errors, warnings, info)
4. **Creates PR comment** with summary table and top issues
5. **Creates annotations** on code lines with violations
6. **Sets check status** (pass/fail) based on thresholds
7. **Blocks merge** if thresholds exceeded (configurable)

## PR Comment Example

```markdown
## 🔍 Checkstyle Report

### ❌ Quality checks failed

| Metric | Count | Threshold | Status |
|--------|-------|-----------|--------|
| Errors | 3 | 0 | ❌ |
| Warnings | 15 | 10 | ⚠️ |
| Info | 5 | - | ℹ️ |

<details>
<summary>📋 Top Issues (click to expand)</summary>

| File | Line | Severity | Message |
|------|------|----------|----------|
| User.java | 10 | ❌ | Missing javadoc comment |
| Service.java | 25 | ⚠️ | Line too long (120 > 100) |
...

</details>
```

## Troubleshooting

### "Checkstyle result file not found"

**Solution:** Add Maven Checkstyle plugin to your `pom.xml` (see Prerequisites).

### "Too many violations"

**Solution:** 
1. Fix code issues, or
2. Increase thresholds temporarily, or
3. Use custom Checkstyle config with relaxed rules

### Action fails but no errors shown

**Solution:** Check that `github-token` is provided and has permissions to comment on PRs.

## Onboarding New Repositories

### Step 1: Add Checkstyle to pom.xml

```xml
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

### Step 2: Create Workflow

Create `.github/workflows/lint.yml`:

```yaml
name: Lint Check

on:
  pull_request:
    branches: [main]

jobs:
  checkstyle:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up JDK
        uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'
      
      - name: Run Checkstyle
        uses: YOUR-USERNAME/checkstyle-lint-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Step 3: Make It Required

1. Go to repository Settings → Branches
2. Add branch protection rule for `main`
3. Check "Require status checks to pass"
4. Select "checkstyle" check
5. Save

### Step 4: Test

1. Open a PR with some code issues
2. Watch action run
3. See PR comment and annotations
4. Try to merge (should be blocked)
5. Fix issues
6. Push again
7. Merge allowed ✅

## License

MIT

## Contributing

Issues and PRs welcome!