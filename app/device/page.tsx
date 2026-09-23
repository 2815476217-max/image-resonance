import { Suspense } from 'react';
import DeviceStage from '@/components/DeviceStage';
import './device.css';

export default function DevicePage() {
  return <Suspense fallback={<main className="device-stage" />}><DeviceStage /></Suspense>;
}
