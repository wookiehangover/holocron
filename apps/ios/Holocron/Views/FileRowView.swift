import SwiftUI

/// A row component displaying a single file with icon, name, size, and date.
struct FileRowView: View {
    let file: HolocronFile

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: iconName(for: file.mimeType))
                .font(.title2)
                .foregroundStyle(.secondary)
                .frame(width: 32, alignment: .center)

            VStack(alignment: .leading, spacing: 2) {
                Text(file.name)
                    .font(.body)
                    .lineLimit(1)

                HStack(spacing: 8) {
                    Text(formattedSize(file.size))
                    Text("·")
                    Text(file.updatedAt, style: .relative)
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }

    // MARK: - MIME Type Icon

    private func iconName(for mimeType: String) -> String {
        if mimeType == "application/pdf" {
            return "doc.fill"
        } else if mimeType.hasPrefix("image/") {
            return "photo"
        } else if mimeType.hasPrefix("text/") {
            return "doc.text"
        } else if mimeType.hasPrefix("video/") {
            return "film"
        } else if mimeType.hasPrefix("audio/") {
            return "speaker.wave.2"
        } else {
            return "doc"
        }
    }

    // MARK: - File Size Formatting

    private func formattedSize(_ bytes: Int64) -> String {
        let kb = Double(bytes) / 1_024
        if kb < 1 {
            return "\(bytes) B"
        }
        let mb = kb / 1_024
        if mb < 1 {
            return String(format: "%.1f KB", kb)
        }
        let gb = mb / 1_024
        if gb < 1 {
            return String(format: "%.1f MB", mb)
        }
        return String(format: "%.2f GB", gb)
    }
}

#Preview {
    List {
        FileRowView(file: HolocronFile(
            id: "1",
            name: "report.pdf",
            path: "docs/report.pdf",
            size: 2_048_000,
            mimeType: "application/pdf",
            checksum: "abc123",
            createdAt: Date(),
            updatedAt: Date().addingTimeInterval(-3600),
            indexingStatus: nil
        ))
        FileRowView(file: HolocronFile(
            id: "2",
            name: "photo.jpg",
            path: "photo.jpg",
            size: 512_000,
            mimeType: "image/jpeg",
            checksum: "def456",
            createdAt: Date(),
            updatedAt: Date().addingTimeInterval(-86400),
            indexingStatus: nil
        ))
    }
}

