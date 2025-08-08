export interface ManualTestCase {
    id: string;
    title: string;
    steps: string[];
    expectedResult: string;
    labels: string[];
    expectedPerStep?: string[];
    preconditions?: string[] | string;
  }