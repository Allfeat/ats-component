import { jsPDF } from 'jspdf';

/**
 * Creator data for PDF certificate
 */
export interface CertificateCreator {
  fullName: string;
  email: string;
  roles: string[];
  ipi?: string;
  isni?: string;
}

/**
 * Data required for PDF certificate generation
 */
export interface CertificateData {
  title: string;
  assetFilename: string;
  hashAudio: string;
  hashTitle: string;
  hashCreators: string;
  hashCommitment: string;
  secret: string;
  proof: string;
  timestamp: string;
  creators: CertificateCreator[];
  blockNumber?: number;
  blockTimestamp?: string;
  explorerUrl?: string;
}

const COLORS = {
  teal: '#4DB8A8',
  black: '#000000',
  gray: '#666666',
};

const FONTS = {
  regular: 'helvetica',
  bold: 'helvetica',
};

/**
 * Formats a timestamp to Polkadot Explorer style in UTC (M/D/YYYY, h:mm:ss AM/PM UTC)
 * Example: 12/5/2025, 3:34:24 PM UTC
 */
function formatTimestampPolkadotStyle(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) {
      return date.toLocaleString('en-US', {
        month: 'numeric',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        timeZone: 'UTC',
      }).replace(',', '') + ' UTC';
    }
    return timestamp;
  } catch {
    return timestamp;
  }
}

/**
 * Generate PDF certificate matching the original ATS app output
 */
export function generateCertificatePDF(data: CertificateData): Blob {
  // Create new PDF document (A4 size)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  let yPosition = margin;

  // Helper function to add text
  const addText = (
    text: string,
    x: number,
    y: number,
    options: {
      fontSize?: number;
      fontStyle?: 'normal' | 'bold';
      color?: string;
      align?: 'left' | 'center' | 'right';
      maxWidth?: number;
    } = {}
  ) => {
    const {
      fontSize = 10,
      fontStyle = 'normal',
      color = COLORS.black,
      align = 'left',
      maxWidth,
    } = options;

    doc.setFontSize(fontSize);
    doc.setFont(FONTS.regular, fontStyle);
    doc.setTextColor(color);

    if (maxWidth) {
      doc.text(text, x, y, { align, maxWidth });
    } else {
      doc.text(text, x, y, { align });
    }
  };

  // Helper function to add wrapped text and return the height used
  const addWrappedTextWithHeight = (
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    options: {
      fontSize?: number;
      fontStyle?: 'normal' | 'bold';
      color?: string;
    } = {}
  ): number => {
    const { fontSize = 8, fontStyle = 'normal', color = COLORS.black } = options;

    doc.setFontSize(fontSize);
    doc.setFont(FONTS.regular, fontStyle);
    doc.setTextColor(color);

    const lines = doc.splitTextToSize(text, maxWidth);
    doc.text(lines, x, y);

    // Calculate line height based on font size (approximately 1.2x font size in mm)
    const lineHeight = fontSize * 0.35;
    return lines.length * lineHeight;
  };

  // ========== HEADER ==========
  // Allfeat text
  addText('Allfeat.', margin, yPosition + 6, {
    fontSize: 20,
    fontStyle: 'bold',
    color: COLORS.black,
  });

  // Certificate title (right side)
  addText('Certificate', pageWidth - margin, yPosition + 6, {
    fontSize: 24,
    fontStyle: 'bold',
    color: COLORS.teal,
    align: 'right',
  });

  yPosition += 12;

  // Separator line
  doc.setDrawColor(COLORS.teal);
  doc.setLineWidth(0.5);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);

  yPosition += 15;

  // ========== FILE INFORMATION ==========
  const valueX = margin + 40;
  const rightColumnX = pageWidth - margin - 65;
  const rightValueStartX = rightColumnX + 30;

  // Row 1: File (left) and Timestamp (right)
  addText('File :', margin, yPosition, {
    fontSize: 9,
    color: COLORS.teal,
    fontStyle: 'bold',
  });
  const maxFilenameWidth = rightColumnX - valueX - 10;
  const truncatedFilename =
    data.assetFilename.length > 35 ? data.assetFilename.substring(0, 35) + '...' : data.assetFilename;
  addText(truncatedFilename, valueX, yPosition, {
    fontSize: 8,
    color: COLORS.black,
    maxWidth: maxFilenameWidth,
  });

  // Timestamp (right side)
  if (data.blockTimestamp) {
    const formattedBlockTimestamp = formatTimestampPolkadotStyle(data.blockTimestamp);
    addText('Timestamp :', rightColumnX, yPosition, {
      fontSize: 9,
      color: COLORS.teal,
      fontStyle: 'bold',
    });
    addText(formattedBlockTimestamp, rightValueStartX, yPosition, {
      fontSize: 8,
      color: COLORS.black,
    });
  }

  yPosition += 7;

  // Row 2: Title (left) and Block number (right)
  addText('Title of the work :', margin, yPosition, {
    fontSize: 9,
    color: COLORS.teal,
    fontStyle: 'bold',
  });
  const titleHeight = addWrappedTextWithHeight(data.title, valueX, yPosition, maxFilenameWidth, {
    fontSize: 8,
    color: COLORS.black,
  });

  // Block number (right side)
  if (data.blockNumber) {
    addText('Block number :', rightColumnX, yPosition, {
      fontSize: 9,
      color: COLORS.teal,
      fontStyle: 'bold',
    });
    addText(String(data.blockNumber), rightValueStartX, yPosition, {
      fontSize: 8,
      color: COLORS.black,
    });
  }

  yPosition += Math.max(12, titleHeight + 4);

  // ========== ESSENTIAL HASHES SECTION ==========
  const fullWidthMaxWidth = pageWidth - margin - valueX;

  // Hash commitment
  addText('Hash commitment :', margin, yPosition, {
    fontSize: 9,
    color: COLORS.teal,
    fontStyle: 'bold',
  });
  const hashHeight = addWrappedTextWithHeight(data.hashCommitment, valueX, yPosition, fullWidthMaxWidth, {
    fontSize: 8,
    color: COLORS.black,
  });

  yPosition += Math.max(6, hashHeight + 2);

  // Secret
  addText('Secret :', margin, yPosition, {
    fontSize: 9,
    color: COLORS.teal,
    fontStyle: 'bold',
  });
  const secretHeight = addWrappedTextWithHeight(data.secret, valueX, yPosition, fullWidthMaxWidth, {
    fontSize: 8,
    color: COLORS.black,
  });

  yPosition += Math.max(12, secretHeight + 4);

  // ========== BLOCK EXPLORER LINK SECTION ==========
  if (data.explorerUrl) {
    addText('Block explorer Allfeat :', margin, yPosition, {
      fontSize: 9,
      color: COLORS.teal,
      fontStyle: 'bold',
    });
    // Explorer URL on same line (smaller font for long URL)
    doc.setFontSize(6);
    const urlLines = doc.splitTextToSize(data.explorerUrl, pageWidth - margin - valueX);
    doc.setTextColor(COLORS.black);
    doc.text(urlLines, valueX, yPosition);

    // Add clickable link covering all lines of the URL
    const lineHeight = 2.5;
    const linkHeight = urlLines.length * lineHeight + 2;
    doc.link(valueX, yPosition - 3, pageWidth - margin - valueX, linkHeight, { url: data.explorerUrl });

    yPosition += 12;
  }

  // ========== CREATORS SECTION ==========
  addText('Creators:', margin, yPosition, {
    fontSize: 11,
    color: COLORS.teal,
    fontStyle: 'bold',
  });

  yPosition += 8;

  // Add each creator with left border
  data.creators.forEach((creator, index) => {
    const leftBorderX = margin + 5;
    const contentX = leftBorderX + 5;
    const creatorValueX = contentX + 30;
    const creatorMaxWidth = pageWidth - margin - creatorValueX;

    // Check if we need a new page (leave space for footer)
    const spaceNeeded = 50;
    if (yPosition + spaceNeeded > pageHeight - margin - 15) {
      doc.addPage();
      yPosition = margin;
    }

    const creatorStartY = yPosition;

    // Full name
    addText('Full name :', contentX, yPosition, {
      fontSize: 9,
      color: COLORS.teal,
      fontStyle: 'bold',
    });
    const fullNameHeight = addWrappedTextWithHeight(creator.fullName, creatorValueX, yPosition, creatorMaxWidth, {
      fontSize: 9,
      color: COLORS.black,
    });

    yPosition += Math.max(6, fullNameHeight + 2);

    // Email
    addText('Email :', contentX, yPosition, {
      fontSize: 9,
      color: COLORS.teal,
      fontStyle: 'bold',
    });
    const emailHeight = addWrappedTextWithHeight(creator.email, creatorValueX, yPosition, creatorMaxWidth, {
      fontSize: 9,
      color: COLORS.black,
    });

    yPosition += Math.max(6, emailHeight + 2);

    // Roles
    addText('Rôle(s) :', contentX, yPosition, {
      fontSize: 9,
      color: COLORS.teal,
      fontStyle: 'bold',
    });
    const rolesText = creator.roles.join(', ');
    const rolesHeight = addWrappedTextWithHeight(rolesText, creatorValueX, yPosition, creatorMaxWidth, {
      fontSize: 9,
      color: COLORS.black,
    });

    yPosition += Math.max(6, rolesHeight + 2);

    // IPI (always show, use N/A if empty)
    addText('IPI :', contentX, yPosition, {
      fontSize: 9,
      color: COLORS.teal,
      fontStyle: 'bold',
    });
    addText(creator.ipi || 'N/A', creatorValueX, yPosition, {
      fontSize: 9,
      color: COLORS.black,
    });

    yPosition += 6;

    // ISNI (always show, use N/A if empty)
    addText('ISNI :', contentX, yPosition, {
      fontSize: 9,
      color: COLORS.teal,
      fontStyle: 'bold',
    });
    addText(creator.isni || 'N/A', creatorValueX, yPosition, {
      fontSize: 9,
      color: COLORS.black,
    });

    yPosition += 6;

    // Draw left border for this creator
    const creatorEndY = yPosition;
    doc.setDrawColor(COLORS.black);
    doc.setLineWidth(0.3);
    doc.line(leftBorderX, creatorStartY - 2, leftBorderX, creatorEndY - 2);

    // Add spacing between creators
    if (index < data.creators.length - 1) {
      yPosition += 6;
    }
  });

  // ========== HASH COMMITMENT RECONSTRUCTION PROCEDURE ==========
  yPosition += 12;

  // Check if we need a new page for the procedure section
  const procedureSpaceNeeded = 80;
  if (yPosition + procedureSpaceNeeded > pageHeight - margin - 15) {
    doc.addPage();
    yPosition = margin;
  }

  // Separator line
  doc.setDrawColor(COLORS.teal);
  doc.setLineWidth(0.3);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);

  yPosition += 8;

  // Section title
  addText('Hash Commitment Reconstruction Procedure', margin, yPosition, {
    fontSize: 11,
    color: COLORS.teal,
    fontStyle: 'bold',
  });

  yPosition += 8;

  const indentX = margin + 5;
  const subIndentX = margin + 10;

  // Helper to add wrapped text and handle page breaks
  const addWrappedText = (text: string, x: number, fontSize: number = 8, _isBold: boolean = false) => {
    doc.setFontSize(fontSize);
    doc.setFont(FONTS.regular, _isBold ? 'bold' : 'normal');
    doc.setTextColor(COLORS.black);
    const wrappedLines = doc.splitTextToSize(text, pageWidth - x - margin);
    wrappedLines.forEach((line: string) => {
      if (yPosition > pageHeight - margin - 15) {
        doc.addPage();
        yPosition = margin;
      }
      doc.text(line, x, yPosition);
      yPosition += 4;
    });
  };

  // Introduction paragraph
  addWrappedText(
    'The hash commitment is the digital fingerprint embedded in the Allfeat blockchain, uniquely identifying all the elements associated with your submission (file, title, creators, roles, secret). It consists of a string of alphanumeric characters.',
    margin
  );

  yPosition += 4;

  // Application link intro
  addWrappedText('To recreate your hash commitment, you can use the application :', margin);

  yPosition += 2;

  // URL with arrow
  addText('-> https://protect.allfeat.org', margin, yPosition, {
    fontSize: 8,
    color: COLORS.black,
    fontStyle: 'bold',
  });
  yPosition += 6;

  // Feature label
  addText('Feature :', margin, yPosition, {
    fontSize: 8,
    color: COLORS.black,
    fontStyle: 'bold',
  });
  addText('"Prove Ownership of a Work"', margin + 17, yPosition, {
    fontSize: 8,
    color: COLORS.black,
  });
  yPosition += 6;

  // Steps label
  addText('Steps :', margin, yPosition, {
    fontSize: 8,
    color: COLORS.black,
    fontStyle: 'bold',
  });
  yPosition += 5;

  // Step list
  const steps = [
    '1. Access the protect.allfeat.org application.',
    '2. Select the "Prove Ownership of a Work" feature.',
    '3. Upload the original file used for the submission.',
    '4. Enter:',
  ];

  steps.forEach((step) => {
    if (yPosition > pageHeight - margin - 15) {
      doc.addPage();
      yPosition = margin;
    }
    addWrappedText(step, indentX);
  });

  // Sub-bullets for Enter section
  const enterItems = [
    '• the title of the work,',
    '• the co-creators and their roles,',
    '• the secret displayed in the certificate, which you alone possess. Note that the secret is linked to the submission, not the user. A different secret is generated for each submission.',
  ];

  enterItems.forEach((item) => {
    if (yPosition > pageHeight - margin - 15) {
      doc.addPage();
      yPosition = margin;
    }
    addWrappedText(item, subIndentX);
  });

  // Step 5
  addWrappedText(
    '5. The application automatically calculates the hash commitment from the information provided.',
    indentX
  );

  yPosition += 4;

  // Comparison steps
  const comparisonSteps = [
    'You can then compare the calculated hash commitment with the one on the blockchain.',
    'To view the hash commitment on the blockchain, you can use a blocks explorer. For exemple the link to the block explorer Allfeat provided in the certificate.',
  ];

  comparisonSteps.forEach((step) => {
    if (yPosition > pageHeight - margin - 15) {
      doc.addPage();
      yPosition = margin;
    }
    addWrappedText(step, indentX);
  });

  // ========== FOOTER - Add to all pages dynamically ==========
  const totalPages = doc.getNumberOfPages();
  const footerY = pageHeight - margin + 5;
  const formattedTimestamp = formatTimestampPolkadotStyle(new Date().toISOString());

  // Loop through all pages and add footer
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Separator line at bottom (above footer)
    doc.setDrawColor(COLORS.teal);
    doc.setLineWidth(0.5);
    doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);

    // Page number (left)
    addText(`${i}/${totalPages}`, margin, footerY, {
      fontSize: 9,
      color: COLORS.gray,
    });

    // Timestamp (right) - formatted as UTC
    addText(formattedTimestamp, pageWidth - margin, footerY, {
      fontSize: 9,
      color: COLORS.gray,
      align: 'right',
    });
  }

  // Convert to blob
  const pdfBlob = doc.output('blob');
  return pdfBlob;
}
