export type SchoolBoard = "CBSE";

export type SchoolRecord = {
  board: SchoolBoard;
  schoolName: string;
  affiliationNumber?: string;
  schoolCode?: string;
  state?: string;
  district?: string;
  city?: string;
  address?: string;
  website?: string;
};

export type DirectoryFetchResult = {
  board: SchoolBoard;
  records: SchoolRecord[];
  requestedLimit: number;
  fetchedCount: number;
  errors: string[];
};

export type DirectoryScrapeOptions = {
  randomize?: boolean;
  excludeSchoolCodes?: string[];
};
