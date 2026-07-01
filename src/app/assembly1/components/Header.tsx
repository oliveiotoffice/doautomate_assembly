'use client';

import { Moon, Sun } from 'lucide-react';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import type { InspectionApiPayload, InspectionRtc } from '../../../lib/inspectionDataService';
import { useTheme } from './ThemeContext';

const LIVE_REFRESH_MS = 1000;

interface HeaderProps {
  name: string;
  role: string;
  operatorName?: string | number;
}

type HeaderLiveData = {
  operator: string;
  shaftId: string;
  time: string;
  date: string;
};

function formatRtc(rtc?: InspectionRtc | null) {
  if (!rtc) return null;
  const date = new Date(rtc.year, rtc.month - 1, rtc.day, rtc.hour, rtc.minute, rtc.second);
  if (Number.isNaN(date.getTime())) return null;

  return {
    time: date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
    date: date.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }),
  };
}

function formatLocalClock() {
  const now = new Date();
  return {
    time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
    date: now.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }),
  };
}

function liveDataFromPayload(payload: InspectionApiPayload): HeaderLiveData {
  const rtc = formatRtc(payload.common?.rtc);
  const fallbackClock = rtc ?? formatLocalClock();
  const displayValue = (value: unknown) => {
    const text = String(value ?? '').trim();
    return text && text !== '0' && text !== '-' ? text : '--';
  };
  const shaftId = displayValue(payload.common?.shaftId || payload.header.shaftNumber);
  const operator = displayValue(payload.common?.operator || payload.header.operatorId);

  return {
    operator,
    shaftId,
    time: fallbackClock.time,
    date: fallbackClock.date,
  };
}

export default function Header({ name, role, operatorName }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const [liveData, setLiveData] = useState<HeaderLiveData>(() => ({
    operator: String(operatorName ?? name),
    shaftId: '--',
    time: '--:--:-- --',
    date: '--',
  }));

  const t = theme;

  useEffect(() => {
    let alive = true;

    const refresh = async () => {
      try {
        const response = await fetch('/api/assembly/current', { cache: 'no-store' });
        if (!response.ok) return;
        const payload: InspectionApiPayload = await response.json();
        if (alive) setLiveData(liveDataFromPayload(payload));
      } catch {
        if (!alive) return;
        const clock = formatLocalClock();
        setLiveData(previous => ({ ...previous, time: clock.time, date: clock.date }));
      }
    };

    refresh();
    const id = setInterval(refresh, LIVE_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap');

        .hdr-root * { box-sizing: border-box; }

        .hdr-root {
          width: 100%;
          height: 72px;
          background: ${t.headerBg};
          border-bottom: 3px solid #ff6200;
          box-shadow: 0 2px 8px rgba(0,0,0,0.35);
          display: flex;
          align-items: center;
          padding: 0 20px;
          flex-shrink: 0;
          font-family: 'Montserrat', sans-serif;
          transition: background 0.3s ease;
        }

        .hdr-logo-block {
          display: flex;
          align-items: center;
          height: 100%;
          padding-right: 20px;
          border-right: 1px solid ${t.headerBorderColor};
          flex-shrink: 0;
          transition: border-color 0.3s;
        }

        .hdr-vdivider {
          width: 1px;
          height: 40px;
          background: ${t.headerBorderColor};
          flex-shrink: 0;
          transition: background 0.3s;
        }

        .hdr-title-block {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 0 24px;
          min-width: 0;
        }

        .hdr-title-tag {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 2.5px;
          text-transform: uppercase;
          color: #ff6200;
          line-height: 1;
          margin-bottom: 4px;
        }

        .hdr-title-main {
          font-size: 20px;
          font-weight: 800;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          color: ${t.headerText};
          line-height: 1.1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          transition: color 0.3s;
        }

        .hdr-title-main span { color: #ff6200; }
        .hdr-title-main .hdr-title-sub { color: ${t.headerText}; font-weight: 800; transition: color 0.3s; }

        .hdr-info-group {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 20px;
          flex-shrink: 0;
        }

        .hdr-pill {
          display: flex;
          flex-direction: column;
          align-items: center;
          background: ${t.headerSurface};
          border: 1px solid ${t.headerBorderColor};
          border-radius: 6px;
          padding: 7px 16px;
          min-width: 112px;
          box-shadow: ${t.mode === 'dark' ? 'inset 0 1px 0 rgba(255,255,255,0.04)' : 'none'};
          transition: background 0.3s, border-color 0.3s, box-shadow 0.3s;
        }

        .hdr-pill-label {
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: ${t.headerMuted};
          line-height: 1;
          margin-bottom: 3px;
          transition: color 0.3s;
        }

        .hdr-pill-value {
          font-size: 15px;
          font-weight: 700;
          color: ${t.headerText};
          line-height: 1;
          white-space: nowrap;
          transition: color 0.3s;
        }

        .hdr-pill-value.accent { color: #ff6200; }

        .hdr-datetime-block {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          padding: 0 20px;
          flex-shrink: 0;
        }

        .hdr-time {
          font-size: 19px;
          font-weight: 700;
          color: ${t.headerText};
          letter-spacing: 1px;
          line-height: 1;
          transition: color 0.3s;
        }

        /* â”€â”€ THEME TOGGLE (right side) â”€â”€ */
        .hdr-theme-toggle-block {
          display: flex;
          align-items: center;
          padding: 0 20px 0 20px;
          flex-shrink: 0;
        }

        .hdr-toggle-track {
          position: relative;
          width: 52px;
          height: 28px;
          background: ${t.headerSurface};
          border: 1px solid ${t.headerBorderColor};
          border-radius: 14px;
          cursor: pointer;
          transition: background 0.3s, border-color 0.3s;
          display: flex;
          align-items: center;
          padding: 0 4px;
          justify-content: space-between;
          appearance: none;
        }

        .hdr-toggle-track:hover {
          border-color: #ff6200;
        }

        .hdr-toggle-icon {
          width: 16px;
          height: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: ${t.headerMuted};
          z-index: 1;
          flex-shrink: 0;
          transition: color 0.3s;
        }

        .hdr-toggle-thumb {
          position: absolute;
          top: 3px;
          left: ${t.mode === 'dark' ? '3px' : '27px'};
          width: 20px;
          height: 20px;
          background: #ff6200;
          border-radius: 50%;
          transition: left 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 1px 4px rgba(0,0,0,0.3);
        }

        .hdr-admin-block {
          display: flex;
          align-items: center;
          height: 100%;
          padding-left: 20px;
          border-left: 1px solid ${t.headerBorderColor};
          flex-shrink: 0;
          transition: border-color 0.3s;
        }
      `}</style>

      <header className="hdr-root">

        {/* LEFT: Main logo */}
        <div className="hdr-logo-block">
          <Image
            src="/images/logo.png"
            alt="Logo"
            width={200}
            height={70}
            className="object-contain"
            unoptimized
          />
        </div>
        <div className="hdr-vdivider" />

        {/* CENTER: Title */}
        <div className="hdr-title-block">
          <div className="hdr-title-tag">Inspection Module</div>
          <div className="hdr-title-main">
            <span>ZDM</span>
            <span className="hdr-title-sub"> - Titanium Shaft Inspection &amp; Assembly</span>
          </div>
        </div>
        <div className="hdr-vdivider" />

        {/* Live values */}
        <div className="hdr-info-group">
          <div className="hdr-pill">
            <div className="hdr-pill-label">Shaft ID</div>
            <div className="hdr-pill-value accent">{liveData.shaftId}</div>
          </div> <div className="hdr-vdivider" />
          <div className="hdr-pill">
            <div className="hdr-pill-label">Operator</div>
            <div className="hdr-pill-value" title={role}>{liveData.operator}</div>
          </div>
        </div>

        <div className="hdr-vdivider" />

        {/* Live datetime */}
        <div className="hdr-datetime-block">
          <div className="hdr-time">{liveData.time}</div>
        </div>

        <div className="hdr-vdivider" />

        {/* Theme toggle */}
        <div className="hdr-theme-toggle-block">
          <button
            type="button"
            className="hdr-toggle-track"
            onClick={toggleTheme}
            aria-label={`Switch to ${t.mode === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${t.mode === 'dark' ? 'light' : 'dark'} mode`}
          >
            <div className="hdr-toggle-icon">
              <Moon size={11} />
            </div>
            <div className="hdr-toggle-icon">
              <Sun size={11} />
            </div>
            <div className="hdr-toggle-thumb" />
          </button>
        </div>

        <div className="hdr-vdivider" />

        {/* RIGHT: Admin logo */}
        <div className="hdr-admin-block">
          <Image
            src="/images/adminlogo.png"
            alt="Admin"
            width={200}
            height={70}
            className="object-contain"
            unoptimized
          />
        </div>

    

      </header>
    </>
  );
}


