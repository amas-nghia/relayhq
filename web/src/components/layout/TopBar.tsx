import { Bell, ChevronDown, Hexagon } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';

export function TopBar() {
  const pendingCount = useAppStore(state => state.tasks.filter(t => t.status === 'waiting-approval').length);
  const selectedProjectId = useAppStore(state => state.selectedProjectId);
  const setSelectedProjectId = useAppStore(state => state.setSelectedProjectId);
  const projects = useAppStore(state => state.projects);
  const navigate = useNavigate();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  return (
    <header className="fixed top-0 left-0 right-0 h-14 bg-surface/80 backdrop-blur-md border-b border-border z-30 flex items-center justify-between px-4">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 text-primary font-bold text-lg cursor-pointer" onClick={() => navigate('/')}>
          <Hexagon className="w-6 h-6 text-accent fill-accent-light" />
          RelayHQ
        </div>
        
        <div className="relative" ref={dropdownRef}>
          <button 
            className="flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-text-primary px-2 py-1 rounded-md transition-colors hover:bg-surface-secondary"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            {selectedProject ? selectedProject.name : 'All Projects'}
            <ChevronDown className="w-4 h-4 opacity-70" />
          </button>
          
          {isDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-48 bg-surface border border-border rounded-md shadow-lg py-1 z-50">
              <button 
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-surface-secondary transition-colors ${selectedProjectId === null ? 'text-accent font-medium' : 'text-text-secondary'}`}
                onClick={() => { setSelectedProjectId(null); setIsDropdownOpen(false); }}
              >
                All Projects
              </button>
              {projects.map(proj => (
                <button 
                  key={proj.id}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-surface-secondary transition-colors ${selectedProjectId === proj.id ? 'text-accent font-medium' : 'text-text-secondary'}`}
                  onClick={() => { setSelectedProjectId(proj.id); setIsDropdownOpen(false); }}
                >
                  {proj.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button 
          className="relative p-2 rounded-full hover:bg-surface-secondary transition-colors"
          onClick={() => navigate('/approvals')}
        >
          <Bell className={`w-5 h-5 ${pendingCount > 0 ? 'text-status-waiting' : 'text-text-secondary'}`} />
          {pendingCount > 0 && (
            <span className="absolute top-1 right-1 flex items-center justify-center w-4 h-4 text-[10px] font-bold text-white bg-status-blocked rounded-full ring-2 ring-surface">
              {pendingCount}
            </span>
          )}
        </button>
        <button className="flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-text-primary">
          <div className="w-8 h-8 rounded-full bg-accent-light text-accent flex items-center justify-center font-bold">
            A
          </div>
          <span className="hidden md:inline-block">amas</span>
          <ChevronDown className="w-4 h-4 opacity-70" />
        </button>
      </div>
    </header>
  );
}
