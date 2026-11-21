import type { CaChapterMeta } from './types'

/** The chapters of the Computer Awareness book, in reading order. */
export const CA_CHAPTERS: CaChapterMeta[] = [
  { id: 'history-of-computer', number: 1, title: 'History of Computer', tagline: 'From the abacus to artificial intelligence', icon: '🕰️', theme: 'amber' },
  { id: 'computer-hardware', number: 2, title: 'Computer Hardware', tagline: 'CPU, buses, clock speed and the parts inside the box', icon: '🖥️', theme: 'indigo' },
  { id: 'memory', number: 3, title: 'Primary & Secondary Memory', tagline: 'RAM, ROM, cache, disks and every storage unit', icon: '💾', theme: 'violet' },
  { id: 'shortcut-keys', number: 4, title: 'Computer Shortcut Keys', tagline: 'Ctrl, Alt, function keys and Windows-key combos', icon: '⌨️', theme: 'slate' },
  { id: 'monitor', number: 5, title: 'Computer Monitor', tagline: 'Pixels, resolution and display technologies', icon: '🖵', theme: 'sky' },
  { id: 'printer', number: 6, title: 'Printers & Plotters', tagline: 'Impact, laser, inkjet and precision output', icon: '🖨️', theme: 'rose' },
  { id: 'input-devices', number: 7, title: 'Input Devices', tagline: 'Keyboards, scanners, readers and sensors', icon: '🖱️', theme: 'teal' },
  { id: 'dbms', number: 8, title: 'Database Management System', tagline: 'Tables, keys, SQL, ACID and normalisation', icon: '🗄️', theme: 'emerald' },
  { id: 'ms-office', number: 9, title: 'Microsoft Office', tagline: 'The Office family, Microsoft 365 and its rivals', icon: '🏢', theme: 'orange' },
  { id: 'ms-word', number: 10, title: 'Microsoft Word', tagline: 'Formatting, tabs, mail merge and shortcuts', icon: '📝', theme: 'sky' },
  { id: 'ms-excel', number: 11, title: 'Microsoft Excel', tagline: 'Cells, formulas, functions and charts', icon: '📊', theme: 'emerald' },
  { id: 'ms-powerpoint', number: 12, title: 'Microsoft PowerPoint', tagline: 'Slides, views, transitions and animations', icon: '📽️', theme: 'orange' },
  { id: 'email', number: 13, title: 'E-mail', tagline: 'Addresses, protocols, Gmail and email security', icon: '📧', theme: 'rose' },
  { id: 'networking', number: 14, title: 'Networking', tagline: 'OSI, TCP/IP, devices, topologies and ports', icon: '🌐', theme: 'cyan' },
  { id: 'windows-os', number: 15, title: 'Operating System: Windows', tagline: 'Releases, desktop, File Explorer and security', icon: '🪟', theme: 'sky' },
  { id: 'number-system', number: 16, title: 'Number System', tagline: 'Binary, octal, hex, complements and BCD', icon: '🔢', theme: 'violet' },
  { id: 'internet', number: 17, title: 'Internet', tagline: 'The Web, browsers, search engines, URLs and cookies', icon: '🌍', theme: 'teal' },
  { id: 'malware-security', number: 18, title: 'Malware & Security', tagline: 'Viruses, phishing, hackers and protection tools', icon: '🛡️', theme: 'rose' },
  { id: 'software', number: 19, title: 'Computer Software', tagline: 'System, application and open-source software', icon: '💿', theme: 'indigo' },
  { id: 'computer-generations', number: 20, title: 'Computer Generations', tagline: 'Vacuum tubes to AI — five generations', icon: '🧬', theme: 'fuchsia' },
  { id: 'cpu-processor', number: 21, title: 'CPU & Processor', tagline: 'ALU, registers, RISC/CISC, cores, GPU and ARM', icon: '⚙️', theme: 'indigo' },
  { id: 'programming-languages', number: 22, title: 'Programming Languages', tagline: 'Levels, translators, history and OOP', icon: '👨‍💻', theme: 'lime' },
  { id: 'latest-technology', number: 23, title: 'Latest Technology', tagline: 'Chatbots, ChatGPT, blockchain, AI and IoT', icon: '🚀', theme: 'fuchsia' },
  { id: 'booting-and-codes', number: 24, title: 'Computer Booting & Codes', tagline: 'Startup sequence, BIOS, ASCII and Unicode', icon: '🔌', theme: 'amber' },
  { id: 'unix-os', number: 25, title: 'Unix OS', tagline: 'History, architecture, families and commands', icon: '🐚', theme: 'slate' },
  { id: 'linux', number: 26, title: 'Linux', tagline: 'Kernel, distributions, permissions and commands', icon: '🐧', theme: 'orange' },
]

export function chapterMeta(id: string): CaChapterMeta | undefined {
  return CA_CHAPTERS.find((c) => c.id === id)
}
