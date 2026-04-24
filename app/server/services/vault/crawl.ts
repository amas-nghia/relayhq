import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, extname } from "node:path";
import { resolveVaultWorkspaceRoot } from "./runtime";
import type { GenericDocument } from "../kioku/indexer";

export async function crawlGenericDocuments(vaultRoot?: string): Promise<GenericDocument[]> {
  const root = vaultRoot ?? join(resolveVaultWorkspaceRoot(), "vault");
  const docs: GenericDocument[] = [];
  
  async function crawlDir(dir: string) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'shared') continue;
        const fullPath = join(dir, entry.name);
        
        if (entry.isDirectory()) {
           await crawlDir(fullPath);
        } else if (entry.isFile() && extname(entry.name) === '.md') {
           try {
             const content = await readFile(fullPath, 'utf8');
             const stats = await stat(fullPath);
             
             // Extract title (first heading)
             const titleMatch = content.match(/^#\s+(.+)$/m);
             let title = entry.name.replace('.md', '');
             if (titleMatch) title = titleMatch[1];
             
             // Extract hashtags (#some-tag)
             const tagMatches = content.match(/#[a-zA-Z0-9_\-]+/g) || [];
             const tags = [...new Set(tagMatches.map(t => t.substring(1)))];
             
             docs.push({
               id: Buffer.from(relative(root, fullPath)).toString('base64url'),
               title,
               content: content.substring(0, 5000), // Map to first 5000 chars for indexing
               sourcePath: relative(root, fullPath),
               tags,
               updatedAt: stats.mtime.toISOString(),
             });
           } catch {
             // Skip file if unable to read
           }
        }
      }
    } catch {
      // Skip if directory does not exist or cannot be read
    }
  }
  
  await crawlDir(root);
  return docs;
}
