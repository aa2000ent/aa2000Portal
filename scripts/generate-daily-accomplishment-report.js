/**
 * Generates a Daily Accomplishment Report as a .docx file.
 * Run: node scripts/generate-daily-accomplishment-report.js
 * Output: Daily_Accomplishment_Report.docx (in project root)
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  HeadingLevel,
} from 'docx'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const outputPath = path.join(rootDir, 'Daily_Accomplishment_Report.docx')

const today = new Date()
const dateStr = today.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

const doc = new Document({
  title: 'Daily Accomplishment Report',
  creator: 'Clarence A. Portugal',
  description: 'Daily accomplishment report - AA2000 Portal',
  sections: [
    {
      properties: {},
      children: [
        new Paragraph({
          text: 'DAILY ACCOMPLISHMENT REPORT',
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Date: ', bold: true }),
            new TextRun({ text: dateStr }),
          ],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Name: ', bold: true }),
            new TextRun({ text: 'Clarence A. Portugal' }),
          ],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Department / Division: ', bold: true }),
            new TextRun({ text: 'Intern' }),
          ],
          spacing: { after: 400 },
        }),
        new Paragraph({
          text: 'ACCOMPLISHMENTS',
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 200, after: 200 },
        }),
        new Paragraph({
          text: '1. Employees page (Admin) – Improved layout and design: responsive table with card view on mobile, pagination (per page selector, Previous/Next), toolbar with search and filters. Maximized space for “All roles” dropdown and buttons. Ensured sidebar toggle does not overlap content on mobile. Refined card separation and professional styling (left accent, status badges, spacing).',
          spacing: { after: 120 },
        }),
        new Paragraph({
          text: '2. Employees – Add user / Edit user: Added password field (default 0000), placed below Email. Implemented show/hide password toggle for both Add and Edit modals. Wired Edit button to open edit modal and save changes; Delete button with confirmation. All working as intended.',
          spacing: { after: 120 },
        }),
        new Paragraph({
          text: '3. Applications page – Redesigned as portal “Applications” (apps list), not applicant submissions. Implemented app list with columns: App name, Description, Category (Internal/External/Tool/Integration), Version, Status (Active/Inactive). Added search, category and status filters, pagination, and View action. Applied consistent styling with Employees page.',
          spacing: { after: 120 },
        }),
        new Paragraph({
          text: '4. AA2000 Portal – General UI polish: dashboard card styling, table headers (uppercase, spacing), alternating row colors on desktop, refined buttons and focus states. Mobile: employee cards clearly separated with gap and background; pagination and toolbar responsive.',
          spacing: { after: 120 },
        }),
        new Paragraph({
          text: '5. Daily Accomplishment Report – Created DOCX generator script (Node + docx package) that outputs a filled Daily Accomplishment Report. Added npm script “generate-report” for easy regeneration. Report includes date, name (Clarence A. Portugal), department (Intern), accomplishments, and prepared-by section.',
          spacing: { after: 400 },
        }),
        new Paragraph({
          text: 'ISSUES / REMARKS',
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 200, after: 200 },
        }),
        new Paragraph({
          text: 'None. Tasks completed as assigned.',
          spacing: { after: 120 },
        }),
        new Paragraph({
          text: '_________________________________________________________________',
          spacing: { after: 400 },
        }),
        new Paragraph({
          text: 'Prepared by:',
          spacing: { before: 400, after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Clarence A. Portugal', bold: true }),
          ],
          spacing: { after: 120 },
        }),
        new Paragraph({
          text: 'Signature over Printed Name',
          italics: true,
          spacing: { after: 200 },
        }),
        new Paragraph({
          text: 'Intern',
          italics: true,
          spacing: { after: 400 },
        }),
      ],
    },
  ],
})

const buffer = await Packer.toBuffer(doc)
fs.writeFileSync(outputPath, buffer)
console.log('Generated:', outputPath)
