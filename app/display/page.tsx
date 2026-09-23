import { Suspense } from 'react';
import DisplayController from '@/components/DisplayController';
export default function DisplayPage() { return <Suspense fallback={<div className="display-stage" />}><DisplayController /></Suspense>; }
