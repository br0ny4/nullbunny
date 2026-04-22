import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export type HistoryPoint = {
  time: string;
  cpu: number;
  memory: number;
};

export default function DashboardPerformanceChart({ history }: { history: HistoryPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={history}>
        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
        <XAxis dataKey="time" stroke="#888" fontSize={12} />
        <YAxis stroke="#888" fontSize={12} />
        <Tooltip contentStyle={{ backgroundColor: '#121212', borderColor: '#333' }} />
        <Line type="monotone" dataKey="cpu" stroke="#00FF00" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="memory" stroke="#B026FF" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
