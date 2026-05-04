export type ProjectFile = {
  FileName: string
  FilePath: string
}

export type ProjectFileCategory = {
  'WORK-ORDER': ProjectFile[]
  'DAILY-REPORT': ProjectFile[]
  'CHECK-LIST': ProjectFile[]
  OTHER: ProjectFile[]
}

export type ProjectFileData = {
  [companyName: string]: {
    [day: string]: ProjectFileCategory
  }
}

export type ProjectFileResponse = {
  success: boolean
  data: ProjectFileData
}
