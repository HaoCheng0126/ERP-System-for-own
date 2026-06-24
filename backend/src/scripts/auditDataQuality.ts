import 'dotenv/config';
import { AppDataSource } from '../config/database';
import { dataQualityService } from '../services/dataQualityService';

const shouldFix = process.argv.includes('--fix');

async function main() {
  await AppDataSource.initialize();

  const beforeIssues = await dataQualityService.audit();
  console.log(JSON.stringify({
    mode: shouldFix ? 'fix' : 'dry-run',
    issueCount: beforeIssues.length,
    blockingCount: beforeIssues.filter((issue) => issue.severity === 'error').length,
    warningCount: beforeIssues.filter((issue) => issue.severity === 'warning').length,
    issues: beforeIssues,
  }, null, 2));

  if (shouldFix) {
    const result = await dataQualityService.fixDeterministicAmountMismatches();
    const afterIssues = await dataQualityService.audit();
    console.log(JSON.stringify({
      fixedCount: result.fixedCount,
      fixedIssues: result.fixedIssues,
      remainingIssueCount: afterIssues.length,
      remainingIssues: afterIssues,
    }, null, 2));
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  });
