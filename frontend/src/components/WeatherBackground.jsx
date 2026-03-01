import { useEffect, useRef } from "react";

function RainBackground() {
  const canvasRef = useRef();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const drops = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      length: Math.random() * 20 + 10,
      speed: Math.random() * 4 + 4,
      opacity: Math.random() * 0.4 + 0.1,
      width: Math.random() * 1.5 + 0.5,
    }));

    let animId;
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drops.forEach((drop) => {
        ctx.beginPath();
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x - drop.length * 0.2, drop.y + drop.length);
        ctx.strokeStyle = `rgba(174, 214, 241, ${drop.opacity})`;
        ctx.lineWidth = drop.width;
        ctx.lineCap = "round";
        ctx.stroke();
        drop.y += drop.speed;
        drop.x -= drop.speed * 0.2;
        if (drop.y > canvas.height) {
          drop.y = -drop.length;
          drop.x = Math.random() * canvas.width;
        }
      });
      animId = requestAnimationFrame(draw);
    }
    draw();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" />;
}

function SnowBackground() {
  const canvasRef = useRef();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const flakes = Array.from({ length: 80 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      radius: Math.random() * 4 + 1,
      speed: Math.random() * 1.5 + 0.5,
      drift: Math.random() * 0.8 - 0.4,
      opacity: Math.random() * 0.6 + 0.2,
    }));

    let animId;
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      flakes.forEach((flake) => {
        ctx.beginPath();
        ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${flake.opacity})`;
        ctx.fill();
        flake.y += flake.speed;
        flake.x += flake.drift;
        if (flake.y > canvas.height) {
          flake.y = -flake.radius;
          flake.x = Math.random() * canvas.width;
        }
      });
      animId = requestAnimationFrame(draw);
    }
    draw();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" />;
}

function ThunderBackground() {
  const canvasRef = useRef();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const drops = Array.from({ length: 150 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      length: Math.random() * 25 + 15,
      speed: Math.random() * 6 + 6,
      opacity: Math.random() * 0.5 + 0.1,
      width: Math.random() * 2 + 0.5,
    }));

    let flashTimer = 0;
    let flashOpacity = 0;
    let animId;

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Lightning flash
      flashTimer++;
      if (flashTimer > 180 && Math.random() < 0.02) {
        flashOpacity = 0.15;
        flashTimer = 0;
      }
      if (flashOpacity > 0) {
        ctx.fillStyle = `rgba(200, 220, 255, ${flashOpacity})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        flashOpacity -= 0.01;
      }

      drops.forEach((drop) => {
        ctx.beginPath();
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x - drop.length * 0.25, drop.y + drop.length);
        ctx.strokeStyle = `rgba(150, 190, 220, ${drop.opacity})`;
        ctx.lineWidth = drop.width;
        ctx.lineCap = "round";
        ctx.stroke();
        drop.y += drop.speed;
        drop.x -= drop.speed * 0.25;
        if (drop.y > canvas.height) {
          drop.y = -drop.length;
          drop.x = Math.random() * canvas.width;
        }
      });

      animId = requestAnimationFrame(draw);
    }
    draw();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" />;
}

function SunnyBackground() {
  const canvasRef = useRef();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    let angle = 0;
    let animId;

    // Floating particles / dust
    const particles = Array.from({ length: 40 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      radius: Math.random() * 2 + 0.5,
      speed: Math.random() * 0.3 + 0.1,
      opacity: Math.random() * 0.3 + 0.05,
    }));

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      angle += 0.002;

      // Sun rays from top right
      const sunX = canvas.width * 0.85;
      const sunY = canvas.height * 0.1;
      for (let i = 0; i < 12; i++) {
        const rayAngle = angle + (i * Math.PI * 2) / 12;
        const innerR = 60;
        const outerR = 300 + Math.sin(angle * 3 + i) * 30;
        ctx.beginPath();
        ctx.moveTo(
          sunX + Math.cos(rayAngle - 0.05) * innerR,
          sunY + Math.sin(rayAngle - 0.05) * innerR
        );
        ctx.lineTo(
          sunX + Math.cos(rayAngle) * outerR,
          sunY + Math.sin(rayAngle) * outerR
        );
        ctx.lineTo(
          sunX + Math.cos(rayAngle + 0.05) * innerR,
          sunY + Math.sin(rayAngle + 0.05) * innerR
        );
        ctx.closePath();
        ctx.fillStyle = `rgba(255, 220, 100, 0.04)`;
        ctx.fill();
      }

      // Floating dust particles
      particles.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 230, 150, ${p.opacity})`;
        ctx.fill();
        p.y -= p.speed;
        p.x += Math.sin(angle + p.y * 0.01) * 0.3;
        if (p.y < -5) {
          p.y = canvas.height + 5;
          p.x = Math.random() * canvas.width;
        }
      });

      animId = requestAnimationFrame(draw);
    }
    draw();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" />;
}

function FogBackground() {
  const canvasRef = useRef();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const clouds = Array.from({ length: 8 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      width: Math.random() * 400 + 200,
      height: Math.random() * 100 + 60,
      speed: Math.random() * 0.3 + 0.1,
      opacity: Math.random() * 0.08 + 0.03,
    }));

    let animId;
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      clouds.forEach((cloud) => {
        const gradient = ctx.createRadialGradient(
          cloud.x, cloud.y, 0,
          cloud.x, cloud.y, cloud.width / 2
        );
        gradient.addColorStop(0, `rgba(200, 210, 220, ${cloud.opacity})`);
        gradient.addColorStop(1, "rgba(200, 210, 220, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(cloud.x, cloud.y, cloud.width / 2, cloud.height / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        cloud.x += cloud.speed;
        if (cloud.x - cloud.width / 2 > canvas.width) {
          cloud.x = -cloud.width / 2;
        }
      });
      animId = requestAnimationFrame(draw);
    }
    draw();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" />;
}

export default function WeatherBackground({ weatherCode, temp }) {
  if (weatherCode === undefined || weatherCode === null) return null;
  if (weatherCode >= 95) return <ThunderBackground />;
  if (weatherCode >= 71 && weatherCode <= 77) return <SnowBackground />;
  if (weatherCode >= 51 && weatherCode <= 82) return <RainBackground />;
  if (weatherCode >= 45 && weatherCode <= 48) return <FogBackground />;
  if (weatherCode <= 3) return <SunnyBackground />;
  return null;
}