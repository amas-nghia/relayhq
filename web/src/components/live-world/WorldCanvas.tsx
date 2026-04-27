import { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';
import { useAppStore } from '../../store/appStore';
import { Task } from '../../types';

export function WorldCanvas() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const projects = useAppStore(state => state.projects);
  const agents = useAppStore(state => state.agents);

  useEffect(() => {
    if (!canvasRef.current) return;

    let app: PIXI.Application;
    let isDestroyed = false;
    let tickerCleanup: (() => void) | null = null;
    let removeWheelListener: (() => void) | null = null;

    const initPixi = async () => {
      app = new PIXI.Application();
      await app.init({ 
        background: '#090a0f',
        resizeTo: canvasRef.current as HTMLElement,
        antialias: true
      });
      
      if (isDestroyed) {
        app.destroy(true, { children: true });
        return;
      }
      
      canvasRef.current?.appendChild(app.canvas);
      appRef.current = app;

      const container = new PIXI.Container();
      app.stage.addChild(container);

      const agentTexture = await PIXI.Assets.load('/assets/characters/cyber-demon.png') as PIXI.Texture;
      if (isDestroyed) {
        app.destroy(true, { children: true });
        return;
      }

      // Pan & Zoom
      let dragging = false;
      let startX = 0;
      let startY = 0;
      let containerStartX = 0;
      let containerStartY = 0;

      app.stage.eventMode = 'static';
      app.stage.hitArea = new PIXI.Rectangle(-100000, -100000, 200000, 200000);
      
      app.stage.on('pointerdown', (e) => {
        dragging = true;
        startX = e.global.x;
        startY = e.global.y;
        containerStartX = container.x;
        containerStartY = container.y;
      });
      app.stage.on('pointerup', () => dragging = false);
      app.stage.on('pointerupoutside', () => dragging = false);
      app.stage.on('pointermove', (e) => {
        if (dragging) {
          container.x = containerStartX + (e.global.x - startX);
          container.y = containerStartY + (e.global.y - startY);
        }
      });

      const handleWheel = (e: WheelEvent) => {
        e.preventDefault();
        const pointer = app.renderer.events.pointer;
        const pt = { x: pointer.global.x, y: pointer.global.y };
        
        let scaleDiff = e.deltaY > 0 ? 0.9 : 1.1;
        const localPoint = container.toLocal(pt);
        
        container.scale.x *= scaleDiff;
        container.scale.y *= scaleDiff;
        
        const newGlobalPoint = container.toGlobal(localPoint);
        container.x += pt.x - newGlobalPoint.x;
        container.y += pt.y - newGlobalPoint.y;
      };

      canvasRef.current?.addEventListener('wheel', handleWheel, { passive: false });
      removeWheelListener = () => {
        canvasRef.current?.removeEventListener('wheel', handleWheel);
      };

      // Layout Grid (Floor)
      const grid = new PIXI.Graphics();
      for (let i = -2000; i < 2000; i += 100) {
        grid.moveTo(i, -2000).lineTo(i, 2000).stroke({ width: 1, color: 0x1e293b, alpha: 0.3 });
        grid.moveTo(-2000, i).lineTo(2000, i).stroke({ width: 1, color: 0x1e293b, alpha: 0.3 });
      }
      container.addChild(grid);

      // Draw Rooms
      const projectRooms = new Map();
      projects.forEach((proj, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const rmWidth = 320;
        const rmHeight = 200;
        const rx = 50 + col * (rmWidth + 60);
        const ry = 50 + row * (rmHeight + 60);

        const room = new PIXI.Container();
        room.position.set(rx, ry);
        container.addChild(room);

        const bg = new PIXI.Graphics();
        bg.roundRect(0, 0, rmWidth, rmHeight, 16);
        bg.fill({ color: 0x1e293b, alpha: 0.8 });
        bg.stroke({ width: 2, color: 0x334155 });
        room.addChild(bg);

        const title = new PIXI.Text({ text: proj.name + ' Room', style: { fontSize: 16, fill: 0x94a3b8, fontFamily: 'Inter, sans-serif', fontWeight: 'bold' } });
        title.position.set(16, 16);
        room.addChild(title);

        // TODO Table
        const todoTable = new PIXI.Graphics();
        todoTable.roundRect(16, 50, 120, 130, 8);
        todoTable.fill({ color: 0x0f172a, alpha: 0.6 });
        todoTable.stroke({ width: 1, color: 0x334155 });
        room.addChild(todoTable);
        const todoLabel = new PIXI.Text({ text: "TODO TABLE", style: { fontSize: 10, fill: 0x475569, fontFamily: 'Inter, sans-serif', fontWeight: 'bold' } });
        todoLabel.position.set(20, 54);
        room.addChild(todoLabel);

        // DONE Table
        const doneTable = new PIXI.Graphics();
        doneTable.roundRect(184, 50, 120, 130, 8);
        doneTable.fill({ color: 0x0f172a, alpha: 0.6 });
        doneTable.stroke({ width: 1, color: 0x334155 });
        room.addChild(doneTable);
        const doneLabel = new PIXI.Text({ text: "DONE TABLE", style: { fontSize: 10, fill: 0x475569, fontFamily: 'Inter, sans-serif', fontWeight: 'bold' } });
        doneLabel.position.set(188, 54);
        room.addChild(doneLabel);

        projectRooms.set(proj.id, {
          x: rx, y: ry,
          todo: { x: rx + 16, y: ry + 50, w: 120, h: 130 },
          done: { x: rx + 184, y: ry + 50, w: 120, h: 130 }
        });
      });

      // Draw Desks
      const agentDesks = new Map();
      const desksStartY = 50 + Math.ceil(projects.length / 2) * 260 + 50;
      const deskContainer = new PIXI.Container();
      container.addChild(deskContainer);

      const bullpenBg = new PIXI.Graphics();
      bullpenBg.roundRect(30, desksStartY - 30, 760, 200, 16);
      bullpenBg.fill({ color: 0x0f172a, alpha: 0.4 });
      bullpenBg.stroke({ width: 2, color: 0x1e293b, alpha: 0.5 });
      deskContainer.addChild(bullpenBg);

      const bullpenTitle = new PIXI.Text({ text: 'AGENT WORK AREA', style: { fontSize: 14, fill: 0x475569, fontFamily: 'Inter, sans-serif', letterSpacing: 2 } });
      bullpenTitle.position.set(50, desksStartY - 15);
      deskContainer.addChild(bullpenTitle);

      agents.forEach((agent, idx) => {
        const dx = 60 + idx * 180;
        const dy = desksStartY + 40;

        const desk = new PIXI.Graphics();
        desk.roundRect(0, 0, 140, 100, 8);
        desk.fill({ color: 0x1e293b, alpha: 0.9 });
        desk.stroke({ width: 2, color: 0x3b82f6, alpha: 0.3 });
        desk.position.set(dx, dy);
        deskContainer.addChild(desk);

        // Desk monitor
        desk.roundRect(40, 10, 60, 10, 2).fill({ color: 0x0f172a }); // screen
        desk.roundRect(50, 20, 40, 40, 2).fill({ color: 0x0f172a }); // keyboard pad

        const title = new PIXI.Text({ text: agent.name.toUpperCase(), style: { fontSize: 11, fill: 0x94a3b8, fontFamily: 'Inter, sans-serif', fontWeight: 'bold' } });
        title.position.set(dx + 8, dy + 80);
        deskContainer.addChild(title);

        agentDesks.set(agent.id, { x: dx, y: dy, centerX: dx + 70, centerY: dy + 45 });
      });

      // Sprites maps
      const agentSprites = new Map();
      agents.forEach(agent => {
        const sprite = new PIXI.Container();
        const isStale = agent.state === 'stale'
        const isWaiting = agent.state === 'waiting';
        const isActive = agent.state === 'active';
        const fillColor = isStale ? 0x64748b : isWaiting ? 0xf59e0b : 0x2563eb;
        const strokeColor = isStale ? 0x94a3b8 : isWaiting ? 0xfbbf24 : isActive ? 0x60a5fa : 0x64748b;

        const glow = new PIXI.Graphics();
        glow.circle(0, 0, 22);
        glow.fill({ color: fillColor, alpha: 0.18 });
        glow.stroke({ width: 2, color: strokeColor, alpha: 0.55 });
        sprite.addChild(glow);

        const avatar = new PIXI.Sprite(agentTexture);
        avatar.anchor.set(0.5);
        avatar.width = 36;
        avatar.height = 36;
        sprite.addChild(avatar);

        const initials = agent.name.slice(0, 2).toUpperCase();
        const txt = new PIXI.Text({ text: initials, style: { fontSize: 12, fill: 0xffffff, fontWeight: 'bold', fontFamily: 'Inter, sans-serif' } });
        txt.anchor.set(0.5);
        sprite.addChild(txt);

        const desk = agentDesks.get(agent.id);
        sprite.position.set(desk.centerX, desk.centerY);
        container.addChild(sprite);
        agentSprites.set(agent.id, sprite);
      });

      const taskSprites = new Map();

      // Ensure objects sort properly if needed (simplified by adding to container layer)
      // Tasks should be below agents. Since agents were added before tasks in container,
      // we need to push tasks to bottom or bring agents to front. We just manage children.

      const drawTaskSprite = (sprite: PIXI.Graphics, task: Task) => {
        sprite.clear();
        sprite.roundRect(0, 0, 36, 24, 4);
        
        let color = 0x94a3b8;
        if (task.status === 'in-progress') color = 0x3b82f6;
        else if (task.status === 'done') color = 0x10b981;
        else if (task.status === 'blocked') color = 0xef4444;
        else if (task.status === 'waiting-approval') color = 0xf59e0b;
        
        sprite.fill({ color });
        sprite.stroke({ width: 2, color: 0xffffff, alpha: 0.1 });
      };

      const getTaskTarget = (task: Task, allTasks: Task[]) => {
        const room = projectRooms.get(task.projectId);
        if (!room) return { x: 50, y: 50 };
        
        if (task.status === 'todo') {
          const myIndex = allTasks.filter(t => t.projectId === task.projectId && t.status === 'todo').findIndex(t => t.id === task.id);
          const col = myIndex % 3;
          const row = Math.floor(myIndex / 3);
          return { x: room.todo.x + 8 + col * 38, y: room.todo.y + 24 + row * 28 };
        } else if (task.status === 'done') {
          const myIndex = allTasks.filter(t => t.projectId === task.projectId && t.status === 'done').findIndex(t => t.id === task.id);
          const col = myIndex % 3;
          const row = Math.floor(myIndex / 3);
          return { x: room.done.x + 8 + col * 38, y: room.done.y + 24 + row * 28 };
        } else {
          // in progress at desk
          if (task.assigneeId) {
            const desk = agentDesks.get(task.assigneeId);
            if (desk) {
              const myIndex = allTasks.filter(t => t.assigneeId === task.assigneeId && t.status === task.status).findIndex(t => t.id === task.id);
              return { x: desk.x + 10 + (myIndex % 3) * 38, y: desk.y + 10 + Math.floor(myIndex / 3) * 28 };
            }
          }
          return { x: room.todo.x + 40, y: room.todo.y + 50 };
        }
      };

      // Ticker loop
      const tickerFn = (ticker: PIXI.Ticker) => {
        if (isDestroyed) return;
        const tasks = useAppStore.getState().tasks;
        const dt = ticker.deltaTime;

        // Sync Task Sprites
        tasks.forEach(task => {
          let sprite = taskSprites.get(task.id);
          if (!sprite) {
            sprite = new PIXI.Graphics();
            drawTaskSprite(sprite, task);
            
            const txt = new PIXI.Text({ text: task.id.split('-').pop() || '', style: { fontSize: 8, fill: 0x0f172a, fontFamily: 'Inter, sans-serif', fontWeight: 'bold' }});
            txt.position.set(4, 6);
            sprite.addChild(txt);
            
            const target = getTaskTarget(task, tasks);
            sprite.position.set(target.x, target.y);
            
            // Insert below agents (agents are at end of container.children)
            container.addChildAt(sprite, container.children.length - agents.length);
            taskSprites.set(task.id, sprite);
          } else {
            drawTaskSprite(sprite, task);
          }

          const target = getTaskTarget(task, tasks);
          // Lerp task
          sprite.x += (target.x - sprite.x) * 0.08 * dt;
          sprite.y += (target.y - sprite.y) * 0.08 * dt;
        });

        // Cleanup deleted tasks
        taskSprites.forEach((sprite, id) => {
          if (!tasks.find(t => t.id === id)) {
            container.removeChild(sprite);
            sprite.destroy();
            taskSprites.delete(id);
          }
        });

        // Sync Agents
        agents.forEach(agent => {
          const sprite = agentSprites.get(agent.id);
          const desk = agentDesks.get(agent.id);
          const activeTask = tasks.find(t => t.assigneeId === agent.id && t.status !== 'done' && t.status !== 'todo');
          
          let targetX = desk.centerX;
          let targetY = desk.centerY;

          if (activeTask && agent.state !== 'stale') {
             const taskSprite = taskSprites.get(activeTask.id);
             if (taskSprite) {
               // Agent holds task
               targetX = taskSprite.x + 18;
               targetY = taskSprite.y + 12;

               // Bop animation for working
                if (activeTask.status === 'in-progress') {
                  sprite.scale.y = 1 + Math.sin(performance.now() * 0.015) * 0.1;
                  sprite.scale.x = 1 - Math.sin(performance.now() * 0.015) * 0.05;
                } else {
                  sprite.scale.set(1);
                }
              }
          } else if (agent.state === 'stale') {
             sprite.scale.set(1);
          } else {
             sprite.scale.set(1);
          }

          // Move agent smoothly chasing task or desk
          sprite.x += (targetX - sprite.x) * 0.15 * dt;
          sprite.y += (targetY - sprite.y) * 0.15 * dt;

          // Bob if moving
          if (agent.state !== 'stale' && (Math.abs(targetX - sprite.x) > 2 || Math.abs(targetY - sprite.y) > 2)) {
            sprite.y += Math.sin(performance.now() * 0.02) * 2;
          }
        });
      };
      app.ticker.add(tickerFn);
      tickerCleanup = () => {
        app.ticker.remove(tickerFn);
      };

      // Initial center
      container.position.set(0, 0);
      container.scale.set(0.9);
      
      return () => {
        tickerCleanup?.();
        tickerCleanup = null;
        removeWheelListener?.();
        removeWheelListener = null;
      }
    };

    let cleanupFn: (() => void) | void;
    initPixi().then(cleanup => cleanupFn = cleanup);

    return () => {
      isDestroyed = true;
      if (cleanupFn) cleanupFn();
      tickerCleanup?.();
      tickerCleanup = null;
      removeWheelListener?.();
      removeWheelListener = null;
      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
      }
    };
  }, [agents, projects]); 

  return (
    <div className="flex-1 w-full h-full relative border border-border rounded-xl overflow-hidden bg-[#090a0f]" ref={canvasRef}>
      {/* Overlay UI over the canvas */}
      <div className="absolute top-4 right-4 bg-surface/80 backdrop-blur border border-border p-3 rounded-xl shadow-xl pointer-events-none">
        <div className="flex gap-4 text-xs font-medium">
           <span className="flex items-center gap-1.5"><div className="w-2 h-2 bg-[#94a3b8] rounded-full"></div> Todo </span>
           <span className="flex items-center gap-1.5"><div className="w-2 h-2 bg-[#3b82f6] rounded-full"></div> In Progress </span>
           <span className="flex items-center gap-1.5"><div className="w-2 h-2 bg-[#10b981] rounded-full"></div> Done </span>
        </div>
      </div>
    </div>
  );
}
