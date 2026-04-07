import { Card, CardHeader, CardBody } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';

export function PredictionPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-bold text-text">Prediction Markets</h1>
        <Badge variant="purple">Beta</Badge>
      </div>
      <div className="bg-orange/10 border border-orange/20 rounded-xl p-4">
        <p className="text-sm text-orange font-medium">⚠ Geo-restricted: US and South Korea IPs are blocked by Jupiter.</p>
      </div>
      <Card>
        <CardHeader title="Active Events" subtitle="Prediction market events" />
        <CardBody>
          <p className="text-sm text-text-dim">Loading prediction market events...</p>
        </CardBody>
      </Card>
    </div>
  );
}
