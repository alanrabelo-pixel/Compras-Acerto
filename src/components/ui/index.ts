/**
 * Biblioteca de componentes reutilizáveis do sistema. Ver relatório de
 * modernização (Fase 3). Cada componente aqui é um wrapper tipado em cima
 * das classes de globals.css já existentes (não muda a aparência atual de
 * nenhuma tela); o valor é ter um único lugar para ajustar o padrão visual
 * em vez de `className="btn btn-primary"` repetido em toda tela.
 */
export { Button } from "./Button";
export type { ButtonVariant, ButtonProps } from "./Button";
export { Badge } from "./Badge";
export type { BadgeVariant } from "./Badge";
export { Input, Select, Textarea } from "./Input";
export { Field } from "./Field";
export { Card } from "./Card";
export { AiTag } from "./AiTag";
export { TableWrap, TableHeadRow, TableRow, TableEmpty } from "./Table";
export { Breadcrumb } from "./Breadcrumb";
export type { BreadcrumbItem } from "./Breadcrumb";
export { Modal } from "./Modal";
export { WarningNotice } from "./WarningNotice";
export { Tabs } from "./Tabs";
export type { TabDef } from "./Tabs";
export { cx } from "./cx";
