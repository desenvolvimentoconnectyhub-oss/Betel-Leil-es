import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import type { OpportunityRow } from "@/lib/admin/mock-data";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScoreBadge } from "./ScoreBadge";
import { RiskBadge } from "./RiskBadge";
import { StatusBadge, getStatusTone } from "./StatusBadge";

export function DataTable({ rows }: { rows: OpportunityRow[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--admin-border)]">
      <Table className="min-w-[1120px]">
        <TableHeader className="bg-[rgba(255,255,255,0.02)]">
          <TableRow className="border-[var(--admin-border)] hover:bg-transparent">
            {[
              "Imovel",
              "Cidade/UF",
              "Fonte",
              "Lance inicial",
              "Desconto",
              "Score oportunidade",
              "Score risco",
              "Status IA",
              "Status juridico",
              "Proxima acao",
              "",
            ].map((head) => (
              <TableHead
                key={head}
                className="h-11 px-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--admin-muted)]"
              >
                {head}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={`${row.property}-${row.location}`}
              className="border-[var(--admin-border)] bg-[var(--admin-card)] hover:bg-[rgba(255,255,255,0.03)]"
            >
              <TableCell className="px-3 py-3">
                {row.id ? (
                  <Link
                    href={`/admin/oportunidades/${row.id}`}
                    className="font-semibold text-white transition hover:text-[var(--admin-cyan)]"
                  >
                    {row.property}
                  </Link>
                ) : (
                  <div className="font-semibold text-white">{row.property}</div>
                )}
                <div className="mt-1 font-mono text-[10px] text-[var(--admin-muted)]">auditavel</div>
              </TableCell>
              <TableCell className="px-3 text-[var(--admin-soft)]">{row.location}</TableCell>
              <TableCell className="px-3 text-[var(--admin-soft)]">{row.source}</TableCell>
              <TableCell className="px-3 font-mono font-semibold text-white">{row.initialBid}</TableCell>
              <TableCell className="px-3 font-mono text-[var(--admin-green)]">{row.discount}</TableCell>
              <TableCell className="px-3">
                <ScoreBadge score={row.opportunityScore} />
              </TableCell>
              <TableCell className="px-3">
                <RiskBadge score={row.riskScore} />
              </TableCell>
              <TableCell className="px-3">
                <StatusBadge tone={getStatusTone(row.aiStatus)}>{row.aiStatus}</StatusBadge>
              </TableCell>
              <TableCell className="px-3">
                <StatusBadge tone={getStatusTone(row.legalStatus)}>{row.legalStatus}</StatusBadge>
              </TableCell>
              <TableCell className="px-3 text-[var(--admin-soft)]">{row.nextAction}</TableCell>
              <TableCell className="px-3 text-right">
                <Button variant="ghost" size="icon-sm" className="text-[var(--admin-muted)] hover:text-white">
                  <MoreHorizontal size={16} />
                  <span className="sr-only">Acoes</span>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
