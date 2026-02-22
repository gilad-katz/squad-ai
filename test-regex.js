const str = `[master 6050b55] feat: Implement personal web notes application 8 files changed, 217 insertions(+) create mode 100644 src/components/NoteForm.tsx create mode 100644 src/components/NoteItem.tsx create mode 100644 src/components/NoteList.tsx create mode 100644 src/hooks/useNotes.ts create mode 100644 src/types/index.ts

Counting objects: 100% (13/13), done. Delta compression using up to 16 threads Compressing objects: 100% (10/10), done. Writing objects: 100% (10/10), 3.01 KiB | 3.01 MiB/s, done. Total 10 (delta 0), reused 0 (delta 0), pack-reused 0 To https://github.com/gilad-katz/test_my_team dd15703..6050b55 master -> master

[main a419aca] feat: Implement personal web notes application
 8 files changed, 160 insertions(+), 56 deletions(-)
 create mode 100644 src/components/NoteItem.tsx`;

const gitCommitRegex = /\[[a-zA-Z0-9_-]+ [a-f0-9]{7}\][\s\S]*?(?:\d+ files? changed[^\n]*\n?)(?:\s*create mode \d+ [^\n]*(?:\n|$))*/g;
const gitPushRegex = /(?:Enumerating|Counting) objects:[\s\S]*?(?:To https?:\/\/[^\s]+[\s\S]*?(?:\n|$))/g;

console.log('REPLACED:');
console.log(str.replace(gitCommitRegex, '').replace(gitPushRegex, '').replace(/\n{3,}/g, '\n\n').trim());
