export interface SchoolYear {
  id: number,
  startYear: string,
  endYear: string,
  // 1 = the current/active school year (exactly one row is active).
  isActive?: boolean
}
