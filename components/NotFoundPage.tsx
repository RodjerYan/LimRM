
import React, { useEffect, useRef } from 'react';

interface NotFoundPageProps {
    onLogin: () => void;
    onRegister: () => void;
}

const NotFoundPage: React.FC<NotFoundPageProps> = ({ onLogin, onRegister }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let width = window.innerWidth;
        let height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;

        let particles: Particle[] = [];
        const gap = 6;
        const mouse = { x: undefined as number | undefined, y: undefined as number | undefined, radius: 150 };
        const colors = ['#fbbf24', '#f59e0b', '#d97706', '#94a3b8'];
        let animationFrameId: number;

        class Particle {
            x: number;
            y: number;
            originX: number;
            originY: number;
            color: string;
            size: number;
            vx: number = 0;
            vy: number = 0;
            ease: number = 0.08;
            dx: number = 0;
            dy: number = 0;

            constructor(x: number, y: number, color: string) {
                this.originX = x;
                this.originY = y;
                this.x = Math.random() * width;
                this.y = Math.random() * height;
                this.color = color || '#fff';
                this.size = Math.random() * 2 + 1.5;
            }

            draw() {
                if (!ctx) return;
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.rect(this.x, this.y, this.size, this.size);
                ctx.fill();
            }

            update() {
                this.dx = this.originX - this.x;
                this.dy = this.originY - this.y;
                this.x += this.dx * this.ease;
                this.y += this.dy * this.ease;

                if (mouse.x !== undefined && mouse.y !== undefined) {
                    const dxMouse = mouse.x - this.x;
                    const dyMouse = mouse.y - this.y;
                    const distance = Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse);

                    if (distance < mouse.radius) {
                        const forceDirectionX = dxMouse / distance;
                        const forceDirectionY = dyMouse / distance;
                        const force = (mouse.radius - distance) / mouse.radius;
                        const directionX = forceDirectionX * force * 40;
                        const directionY = forceDirectionY * force * 40;

                        this.x -= directionX;
                        this.y -= directionY;
                    }
                }
            }
        }

        const createParticles = () => {
            particles = [];
            const textCanvas = document.createElement('canvas');
            const textCtx = textCanvas.getContext('2d');
            if (!textCtx) return;

            textCanvas.width = width;
            textCanvas.height = height;

            const fontSize = Math.max(width * 0.25, 200);
            textCtx.fillStyle = 'white';
            textCtx.font = `900 ${fontSize}px "Montserrat", sans-serif`;
            textCtx.textAlign = 'center';
            textCtx.textBaseline = 'middle';
            textCtx.fillText('404', width / 2, height / 2 - 50);

            const imageData = textCtx.getImageData(0, 0, width, height).data;

            for (let y = 0; y < height; y += gap) {
                for (let x = 0; x < width; x += gap) {
                    const index = (y * width + x) * 4;
                    const alpha = imageData[index + 3];

                    if (alpha > 0) {
                        const color = colors[Math.floor(Math.random() * colors.length)];
                        particles.push(new Particle(x, y, color));
                    }
                }
            }

            // Background noise particles
            for (let i = 0; i < 150; i++) {
                const p = new Particle(Math.random() * width, Math.random() * height, '#334155');
                p.ease = 0.02;
                p.originX = Math.random() * width;
                p.originY = Math.random() * height;
                particles.push(p);
            }
        };

        const animate = () => {
            ctx.clearRect(0, 0, width, height);
            particles.forEach(particle => {
                particle.update();
                particle.draw();
            });
            animationFrameId = requestAnimationFrame(animate);
        };

        const handleResize = () => {
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = width;
            canvas.height = height;
            if (particles.length > 0) createParticles();
        };

        const handleMouseMove = (e: MouseEvent) => {
            mouse.x = e.clientX;
            mouse.y = e.clientY;
        };

        const handleMouseOut = () => {
            mouse.x = undefined;
            mouse.y = undefined;
        };

        window.addEventListener('resize', handleResize);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseout', handleMouseOut);

        createParticles();
        animate();

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseout', handleMouseOut);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <div className="relative w-full h-screen bg-slate-900 overflow-hidden font-sans text-white select-none">
             <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;500;800&display=swap');
                @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
                .animate-fadeIn { animation: fadeIn 2s ease-out forwards 1s; opacity: 0; }
            `}</style>
            
            {/* Grain Texture */}
            <div 
                className="fixed top-0 left-0 w-full h-full pointer-events-none z-[5] opacity-5"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='1'/%3E%3C/svg%3E")` }}
            ></div>

            {/* Logo */}
            <div className="absolute top-10 left-1/2 -translate-x-1/2 z-20 opacity-80 text-xs tracking-[0.3em] font-light text-slate-400 uppercase pointer-events-auto">
                Limkorm Group
            </div>

            {/* Canvas */}
            <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full z-[1]" />

            {/* UI Layer */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 text-center w-full mix-blend-exclusion pointer-events-none">
                {/* Invisible H1 for spacing */}
                <h1 className="text-[12rem] leading-none font-extrabold m-0 tracking-[-10px] opacity-0">404</h1>
                
                <div className="mt-[250px] animate-fadeIn pointer-events-auto">
                    <h2 className="text-2xl md:text-3xl font-light mb-2 text-slate-200">Пользователь не найден</h2>
                    <p className="text-slate-400 font-light text-sm max-w-md mx-auto mb-8">
                        Доступ к системе ограничен. <br/>Пожалуйста, войдите или создайте аккаунт.
                    </p>
                    
                    <div className="flex flex-col gap-4 items-center justify-center">
                         <button 
                            onClick={onLogin}
                            className="px-10 py-3 bg-white text-slate-900 border border-white text-sm uppercase tracking-widest transition-all hover:shadow-[0_0_20px_rgba(255,255,255,0.4)] hover:scale-105"
                        >
                            Авторизоваться
                        </button>
                        <button 
                            onClick={onRegister}
                            className="px-10 py-3 bg-transparent text-white/80 border border-white/30 text-sm uppercase tracking-widest backdrop-blur-sm transition-all hover:bg-white hover:text-slate-900 hover:border-white"
                        >
                            Зарегистрироваться
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NotFoundPage;
