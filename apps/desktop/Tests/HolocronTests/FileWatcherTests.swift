import Testing

@testable import HolocronLib

@Suite("FileWatcher.hasRelevantChange")
struct FileWatcherFilterTests {
    @Test("Normal vault file is relevant")
    func normalFile() {
        let paths = ["/Users/sam/Holocron/notes/daily.md"]
        #expect(FileWatcher.hasRelevantChange(in: paths))
    }

    @Test("Multiple normal files are relevant")
    func multipleNormalFiles() {
        let paths = [
            "/Users/sam/Holocron/notes/daily.md",
            "/Users/sam/Holocron/projects/work.md",
        ]
        #expect(FileWatcher.hasRelevantChange(in: paths))
    }

    @Test(".git changes only are ignored")
    func gitOnly() {
        let paths = [
            "/Users/sam/Holocron/.git/objects/ab/1234",
            "/Users/sam/Holocron/.git/refs/heads/main",
        ]
        #expect(!FileWatcher.hasRelevantChange(in: paths))
    }

    @Test(".obsidian changes only are ignored")
    func obsidianOnly() {
        let paths = [
            "/Users/sam/Holocron/.obsidian/workspace.json",
            "/Users/sam/Holocron/.obsidian/plugins/dataview/data.json",
        ]
        #expect(!FileWatcher.hasRelevantChange(in: paths))
    }

    @Test("Mix of hidden dirs (no relevant) is ignored")
    func hiddenDirsOnly() {
        let paths = [
            "/Users/sam/Holocron/.git/index",
            "/Users/sam/Holocron/.obsidian/app.json",
        ]
        #expect(!FileWatcher.hasRelevantChange(in: paths))
    }

    @Test("Mix with one relevant file is relevant")
    func mixedWithRelevant() {
        let paths = [
            "/Users/sam/Holocron/.git/index",
            "/Users/sam/Holocron/.obsidian/workspace.json",
            "/Users/sam/Holocron/inbox/new-note.md",
        ]
        #expect(FileWatcher.hasRelevantChange(in: paths))
    }

    @Test("Empty paths array is not relevant")
    func emptyPaths() {
        #expect(!FileWatcher.hasRelevantChange(in: []))
    }

    @Test("File named .gitignore at root is relevant")
    func gitignoreFile() {
        let paths = ["/Users/sam/Holocron/.gitignore"]
        #expect(FileWatcher.hasRelevantChange(in: paths))
    }
}

