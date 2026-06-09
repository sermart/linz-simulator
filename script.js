(function() {
    const canvas = document.getElementById('labCanvas');
    const ctx = canvas.getContext('2d');
    const editZone = document.getElementById('edit-zone');
    
    let objects = [];
    let selected = null;
    let dragTarget = null;
    let isRotating = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let W = window.innerWidth;
    let H = window.innerHeight;
    
    function resize() {
        W = canvas.width = window.innerWidth;
        H = canvas.height = window.innerHeight;
    }
    
    function intersect(x1, y1, x2, y2, x3, y3, x4, y4) {
        const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (d === 0) return null;
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / d;
        return (t >= 0 && t <= 1 && u >= 0 && u <= 1) ? { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1), t } : null;
    }

    function castRay(sx, sy, angle, depth = 0) {
        if (depth > 5) return [{ x: sx, y: sy }];
        const ex = sx + Math.cos(angle) * 3000;
        const ey = sy + Math.sin(angle) * 3000;
        let hit = null;
        let hitObj = null;

        for (let o of objects) {
            if (o.type === 'source') continue;
            const r = o.angle * Math.PI / 180;
            
            if (o.type === 'obstacle') {
                const hw = o.w / 2;
                const hh = o.h / 2;
                const cosR = Math.cos(r);
                const sinR = Math.sin(r);
                const pts = [
                    { x: o.x + (-hw * cosR) - (-hh * sinR), y: o.y + (-hw * sinR) + (-hh * cosR) },
                    { x: o.x + (hw * cosR) - (-hh * sinR), y: o.y + (hw * sinR) + (-hh * cosR) },
                    { x: o.x + (hw * cosR) - (hh * sinR), y: o.y + (hw * sinR) + (hh * cosR) },
                    { x: o.x + (-hw * cosR) - (hh * sinR), y: o.y + (-hw * sinR) + (hh * cosR) }
                ];
                
                for (let i = 0; i < 4; i++) {
                    let h = intersect(sx, sy, ex, ey, pts[i].x, pts[i].y, pts[(i + 1) % 4].x, pts[(i + 1) % 4].y);
                    if (h && h.t > 0.001 && (!hit || h.t < hit.t)) {
                        hit = h;
                        hitObj = o;
                    }
                }
            } else {
                // Для линз - линия по центру
                const h2 = o.h / 2;
                const cosR = Math.cos(r);
                const sinR = Math.sin(r);
                const x1 = o.x - sinR * h2;
                const y1 = o.y + cosR * h2;
                const x2 = o.x + sinR * h2;
                const y2 = o.y - cosR * h2;
                
                let h = intersect(sx, sy, ex, ey, x1, y1, x2, y2);
                if (h && h.t > 0.001 && (!hit || h.t < hit.t)) {
                    hit = h;
                    hitObj = o;
                }
            }
        }
        
        if (hit && hitObj) {
            const pts = [{ x: sx, y: sy }, { x: hit.x, y: hit.y }];
            
            if (hitObj.type === 'obstacle') {
                return pts; // Преграда блокирует луч
            }
            
            // Для линз - преломление
            const r = hitObj.angle * Math.PI / 180;
            const f = hitObj.type === 'converging' ? (hitObj.f || 150) : -(hitObj.f || 150);
            
            // Вычисляем локальную координату Y точки падения
            const dx = hit.x - hitObj.x;
            const dy = hit.y - hitObj.y;
            const localHitY = dx * Math.sin(r) - dy * Math.cos(r);
            
            // Угол луча в локальной системе координат линзы
            const localRayAngle = angle - r;
            
            // Формула тонкой линзы: новый угол = старый угол - y/f
            const newLocalAngle = localRayAngle - localHitY / f;
            
            return pts.concat(castRay(hit.x, hit.y, newLocalAngle + r, depth + 1));
        }
        
        return [{ x: sx, y: sy }, { x: ex, y: ey }];
    }

    function render() {
        ctx.clearRect(0, 0, W, H);
        
        // Сетка
        for (let x = 0; x < W; x += 50) {
            ctx.strokeStyle = x % 250 === 0 ? '#1d2636' : '#0b1017';
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, H);
            ctx.stroke();
        }
        for (let y = 0; y < H; y += 50) {
            ctx.strokeStyle = y % 250 === 0 ? '#1d2636' : '#0b1017';
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
            ctx.stroke();
        }

        // Рисуем лучи
        for (let o of objects) {
            if (o.type === 'source') {
                const r = o.angle * Math.PI / 180;
                const h = o.h || 120;
                const step = o.rayCount > 1 ? h / (o.rayCount - 1) : 0;
                
                for (let i = 0; i < o.rayCount; i++) {
                    const ly = -h / 2 + (step * i);
                    const rx = o.x + 15 * Math.cos(r) - ly * Math.sin(r);
                    const ry = o.y + 15 * Math.sin(r) + ly * Math.cos(r);
                    
                    const path = castRay(rx, ry, r);
                    
                    ctx.beginPath();
                    ctx.moveTo(path[0].x, path[0].y);
                    for (let j = 1; j < path.length; j++) {
                        ctx.lineTo(path[j].x, path[j].y);
                    }
                    ctx.strokeStyle = '#ffea00';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
            }
        }

        // Рисуем объекты
        for (let o of objects) {
            ctx.save();
            ctx.translate(o.x, o.y);
            ctx.rotate(o.angle * Math.PI / 180);
            
            const sel = (selected === o);
            ctx.strokeStyle = sel ? '#fff' : '#3a3f47';
            ctx.lineWidth = 2;
            
            if (o.type === 'source') {
                ctx.fillStyle = '#10141d';
                ctx.fillRect(-15, -o.h / 2, 30, o.h);
                ctx.strokeRect(-15, -o.h / 2, 30, o.h);
                ctx.fillStyle = '#ffea00';
                ctx.fillRect(11, -o.h / 2 + 2, 4, o.h - 4);
            } else if (o.type === 'converging') {
                // Собирающая линза - теперь вогнутая форма (была у рассеивающей)
                ctx.fillStyle = sel ? 'rgba(0,229,255,0.3)' : 'rgba(0,229,255,0.15)';
                ctx.strokeStyle = sel ? '#fff' : '#0cf';
                ctx.beginPath();
                ctx.moveTo(-15, -o.h / 2);
                ctx.lineTo(15, -o.h / 2);
                ctx.quadraticCurveTo(4, 0, 15, o.h / 2);
                ctx.lineTo(-15, o.h / 2);
                ctx.quadraticCurveTo(-4, 0, -15, -o.h / 2);
                ctx.fill();
                ctx.stroke();
                
                ctx.fillStyle = '#0cf';
                ctx.font = '600 16px "Segoe UI", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('Р', 0, 0);
            } else if (o.type === 'diverging') {
                // Рассеивающая линза - теперь выпуклая форма (была у собирающей)
                ctx.fillStyle = sel ? 'rgba(255,51,102,0.3)' : 'rgba(255,51,102,0.15)';
                ctx.strokeStyle = sel ? '#fff' : '#ff3366';
                ctx.beginPath();
                ctx.moveTo(0, -o.h / 2);
                ctx.quadraticCurveTo(20, 0, 0, o.h / 2);
                ctx.quadraticCurveTo(-20, 0, 0, -o.h / 2);
                ctx.fill();
                ctx.stroke();
                
                ctx.fillStyle = '#ff3366';
                ctx.font = '600 16px "Segoe UI", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('С', 0, 0);
            } else {
                ctx.fillStyle = 'rgba(20,25,35,0.95)';
                ctx.fillRect(-o.w / 2, -o.h / 2, o.w, o.h);
                ctx.strokeRect(-o.w / 2, -o.h / 2, o.w, o.h);
            }
            
            // Круг выделения
            if (sel) {
                const radius = Math.max(o.w || 30, o.h || 120) / 2 + 18;
                ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.arc(0, 0, radius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
                
                ctx.fillStyle = '#00e5ff';
                ctx.beginPath();
                ctx.arc(0, -radius, 5, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
        
        requestAnimationFrame(render);
    }

    canvas.addEventListener('mousedown', (e) => {
        const mx = e.clientX;
        const my = e.clientY;
        
        // Проверка клика по кольцу вращения
        if (selected) {
            const radius = Math.max(selected.w || 30, selected.h || 120) / 2 + 18;
            const dist = Math.hypot(mx - selected.x, my - selected.y);
            
            if (Math.abs(dist - radius) < 12) {
                isRotating = true;
                dragTarget = null;
                return;
            }
        }
        
        // Поиск объекта под мышкой
        for (let i = objects.length - 1; i >= 0; i--) {
            const o = objects[i];
            const r = o.angle * Math.PI / 180;
            const dx = mx - o.x;
            const dy = my - o.y;
            const lx = dx * Math.cos(-r) - dy * Math.sin(-r);
            const ly = dx * Math.sin(-r) + dy * Math.cos(-r);
            
            let hit = false;
            if (o.type === 'obstacle') {
                hit = Math.abs(lx) < o.w / 2 + 15 && Math.abs(ly) < o.h / 2 + 15;
            } else if (o.type === 'source') {
                hit = Math.abs(lx) < 20 && Math.abs(ly) < o.h / 2 + 15;
            } else {
                hit = Math.abs(ly) < o.h / 2 + 15 && Math.abs(lx) < 25;
            }
            
            if (hit) {
                selected = o;
                dragTarget = o;
                dragOffsetX = mx - o.x;
                dragOffsetY = my - o.y;
                controls();
                return;
            }
        }
        
        selected = null;
        dragTarget = null;
        controls();
    });

    canvas.addEventListener('mousemove', (e) => {
        if (isRotating && selected) {
            let angle = Math.atan2(e.clientY - selected.y, e.clientX - selected.x) * 180 / Math.PI;
            if (selected.type !== 'source') {
                angle += 90;
            }
            selected.angle = angle % 360;
        } else if (dragTarget) {
            dragTarget.x = Math.max(50, Math.min(W - 50, e.clientX - dragOffsetX));
            dragTarget.y = Math.max(50, Math.min(H - 50, e.clientY - dragOffsetY));
        }
    });

    canvas.addEventListener('wheel', (e) => {
        if (!selected) return;
        e.preventDefault();
        selected.angle = (selected.angle + (e.deltaY > 0 ? 5 : -5)) % 360;
    }, { passive: false });

    window.addEventListener('mouseup', () => {
        dragTarget = null;
        isRotating = false;
    });

    function controls() {
        editZone.innerHTML = '';
        
        if (!selected) {
            editZone.innerHTML = '<div class="placeholder">✨ выделите объект на сцене</div>';
            return;
        }
        
        if (selected.type === 'source') {
            slider("🔆 Лучи", "rayCount", 1, 40);
            slider("📐 Высота", "h", 40, 300);
        } else if (selected.type === 'obstacle') {
            slider("📐 Ширина", "w", 15, 150);
            slider("📏 Высота", "h", 40, 400);
        } else {
            slider("🎯 Фокус", "f", 30, 500);
            slider("📏 Высота", "h", 80, 400);
        }
        
        const b = document.createElement('button');
        b.className = 'btn-del';
        b.innerText = '🗑 Удалить';
        b.onclick = () => {
            objects = objects.filter(o => o !== selected);
            selected = null;
            dragTarget = null;
            controls();
        };
        editZone.appendChild(b);
    }

    function slider(label, prop, min, max) {
        const d = document.createElement('div');
        d.className = 'control-item';
        d.innerHTML = `<label>${label}</label><div class="control-row"><input type="range" min="${min}" max="${max}" value="${selected[prop]}"><input type="number" value="${selected[prop]}"></div>`;
        
        const s = d.querySelector('input[type="range"]');
        const n = d.querySelector('input[type="number"]');
        
        s.oninput = () => {
            selected[prop] = parseInt(s.value);
            n.value = s.value;
        };
        
        n.oninput = () => {
            let v = Math.max(min, Math.min(max, parseInt(n.value) || min));
            selected[prop] = v;
            s.value = v;
        };
        
        editZone.appendChild(d);
    }

    // Глобальные функции
    window.clearAll = () => {
        objects = [];
        selected = null;
        dragTarget = null;
        controls();
    };
    
    window.addSource = () => {
        objects.push({
            type: 'source',
            x: 150,
            y: H / 2,
            rayCount: 5,
            h: 120,
            angle: 0
        });
        selected = objects[objects.length - 1];
        controls();
    };
    
    window.addLens = (type) => {
        objects.push({
            type,
            x: W / 2,
            y: H / 2,
            h: 180,
            f: 150,
            angle: 0
        });
        selected = objects[objects.length - 1];
        controls();
    };
    
    window.addObstacle = () => {
        objects.push({
            type: 'obstacle',
            x: W / 2 + 150,
            y: H / 2,
            w: 40,
            h: 120,
            angle: 0
        });
        selected = objects[objects.length - 1];
        controls();
    };

    window.addEventListener('resize', resize);
    resize();
    window.addSource();
    render();
})();