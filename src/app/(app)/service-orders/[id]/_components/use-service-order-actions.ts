"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/react";
import { toast } from "@/lib/toast";

/**
 * Ações (mutations tRPC) do detalhe da OS, extraídas do componente God
 * (service-order-detail concentrava ~2000 linhas com 32 mutations). Concentra
 * toda a escrita da OS + a invalidação num só lugar (locality); o componente
 * apenas consome. As mutations que fecham diálogos recebem os setters via `cb`.
 *
 * NOTA (deepening futuro): a interface larga de callbacks reflete o
 * acoplamento das ~15 flags de diálogo. O próximo passo é consolidar o estado
 * de diálogo num único `activeDialog`/reducer e estreitar esta interface.
 */
export interface ServiceOrderActionCallbacks {
  setAddItemDialog: (v: boolean) => void;
  setCostsEditing: (v: boolean) => void;
  setSignatureDialog: (v: boolean) => void;
  setEditItemId: (v: string | null) => void;
  setTrackingDialog: (v: boolean) => void;
  setSendLabDialog: (v: boolean) => void;
  setNotifyDeliveryDialog: (v: boolean) => void;
  setDeliveryTermDialog: (v: boolean) => void;
  setReturnTermDialog: (v: boolean) => void;
  setTechInfoDialog: (v: boolean) => void;
  setChangeTechDialog: (v: boolean) => void;
  setCheckQuotePending: (v: boolean) => void;
}

export function useServiceOrderActions(cb: ServiceOrderActionCallbacks) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();

  const invalidateOrder = () => {
    void queryClient.invalidateQueries({ queryKey: [["serviceOrder"]] });
  };

  const updateStatusMut = useMutation(
    trpc.serviceOrder.updateStatus.mutationOptions({
      onSuccess: () => { toast.success("Status atualizado!"); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const cancelMut = useMutation(
    trpc.serviceOrder.cancel.mutationOptions({
      onSuccess: () => { toast.success("OS cancelada!"); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const uncancelMut = useMutation(
    trpc.serviceOrder.uncancel.mutationOptions({
      onSuccess: () => { toast.success("OS descancelada!"); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const refundMut = useMutation(
    trpc.serviceOrder.refund.mutationOptions({
      onSuccess: () => { toast.success("OS estornada!"); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const deleteMut = useMutation(
    trpc.serviceOrder.delete.mutationOptions({
      onSuccess: () => { toast.success("OS excluida!"); router.push("/service-orders"); },
      onError: (e) => toast.error(e.message),
    })
  );

  const addItemMut = useMutation(
    trpc.serviceOrder.addItem.mutationOptions({
      onSuccess: () => { toast.success("Item adicionado!"); cb.setAddItemDialog(false); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const removeItemMut = useMutation(
    trpc.serviceOrder.removeItem.mutationOptions({
      onSuccess: () => { toast.success("Item removido!"); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const registerPaymentMut = useMutation(
    trpc.serviceOrder.registerPayment.mutationOptions({
      onSuccess: () => { toast.success("Pagamento registrado!"); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const createFromOSMut = useMutation(
    trpc.sale.createFromOS.mutationOptions({
      onSuccess: (sale) => {
        if (sale?.id) router.push(`/pdv?saleId=${sale.id}`);
      },
      onError: (e: { message: string }) => toast.error(e.message),
    })
  );

  const updateCostsMut = useMutation(
    trpc.serviceOrder.updateCosts.mutationOptions({
      onSuccess: () => { toast.success("Custos atualizados!"); cb.setCostsEditing(false); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const confirmSigMut = useMutation(
    trpc.serviceOrder.confirmPhysicalSignature.mutationOptions({
      onSuccess: () => { toast.success("Assinatura confirmada!"); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const sendForSignatureMut = useMutation(
    trpc.serviceOrder.sendForSignature.mutationOptions({
      onSuccess: () => {
        toast.success("Link de assinatura enviado por WhatsApp!");
        cb.setSignatureDialog(false);
        invalidateOrder();
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const checkSignatureStatusMut = useMutation(
    trpc.serviceOrder.checkSignatureStatus.mutationOptions({
      onSuccess: (data) => {
        if (data.signed) {
          toast.success("Assinatura confirmada!");
        } else {
          toast.info(`Assinaturas: ${data.signaturesCompleted}/${data.totalSignatures}`);
        }
        invalidateOrder();
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const notifyCompletedMut = useMutation(
    trpc.communication.notifyOsCompleted.mutationOptions({
      onSuccess: (data) => {
        if (data.success) toast.success("Notificacao de conclusao enviada por WhatsApp!");
        else toast.error("Falha ao enviar notificacao");
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const updateItemMut = useMutation(
    trpc.serviceOrder.updateItem.mutationOptions({
      onSuccess: () => { toast.success("Item atualizado!"); cb.setEditItemId(null); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const cancelQuoteMut = useMutation(
    trpc.serviceOrder.cancelQuote.mutationOptions({
      onSuccess: () => { toast.success("Alteracao cancelada — itens revertidos."); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const approveQuoteMut = useMutation(
    trpc.serviceOrder.approveQuoteManually.mutationOptions({
      onSuccess: () => { toast.success("Orcamento autorizado!"); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const sendTrackingMut = useMutation(
    trpc.serviceOrder.sendTracking.mutationOptions({
      onSuccess: () => { toast.success("Link de rastreamento enviado!"); cb.setTrackingDialog(false); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const sendToLabMut = useMutation(
    trpc.serviceOrder.sendToLab.mutationOptions({
      onSuccess: () => { toast.success("Aparelho enviado ao laboratorio."); cb.setSendLabDialog(false); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const receiveFromLabMut = useMutation(
    trpc.serviceOrder.receiveFromLab.mutationOptions({
      onSuccess: () => { toast.success("Recebimento confirmado."); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const cancelLabMut = useMutation(
    trpc.serviceOrder.cancelLab.mutationOptions({
      onSuccess: () => { toast.success("Envio cancelado."); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const notifyDeliveryPersonMut = useMutation(
    trpc.serviceOrder.notifyDeliveryPerson.mutationOptions({
      onSuccess: (data: { whatsappSent: boolean }) => {
        toast.success(data.whatsappSent ? "Entregador notificado." : "Entregador atualizado (WhatsApp indisponivel).");
        cb.setNotifyDeliveryDialog(false);
        invalidateOrder();
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const sendReceiptMut = useMutation(
    trpc.serviceOrder.sendReceipt.mutationOptions({
      onSuccess: () => toast.success("Recibo enviado via WhatsApp."),
      onError: (e) => toast.error(e.message),
    })
  );

  const sendDeliveryTermMut = useMutation(
    trpc.serviceOrder.sendDeliveryTerm.mutationOptions({
      onSuccess: (data) => {
        toast.success("Termo de entrega enviado!");
        cb.setDeliveryTermDialog(false);
        if (data.signatureLink) window.open(data.signatureLink, "_blank");
        invalidateOrder();
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const confirmPhysicalDeliveryTermMut = useMutation(
    trpc.serviceOrder.confirmPhysicalDeliveryTerm.mutationOptions({
      onSuccess: () => { toast.success("Termo de entrega confirmado e OS entregue!"); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const checkDeliveryTermStatusMut = useMutation(
    trpc.serviceOrder.checkDeliveryTermStatus.mutationOptions({
      onSuccess: (data) => {
        if (data.signed) toast.success("Termo de entrega assinado! OS entregue.");
        else toast.info("Termo de entrega ainda nao foi assinado.");
        invalidateOrder();
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const sendReturnTermMut = useMutation(
    trpc.serviceOrder.sendReturnTerm.mutationOptions({
      onSuccess: (data) => {
        toast.success("Termo de devolucao enviado!");
        cb.setReturnTermDialog(false);
        if (data.signatureLink) window.open(data.signatureLink, "_blank");
        invalidateOrder();
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const confirmPhysicalReturnTermMut = useMutation(
    trpc.serviceOrder.confirmPhysicalReturnTerm.mutationOptions({
      onSuccess: () => { toast.success("Termo de devolucao confirmado! OS cancelada."); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const checkReturnTermStatusMut = useMutation(
    trpc.serviceOrder.checkReturnTermStatus.mutationOptions({
      onSuccess: (data) => {
        if (data.signed && data.cancelled) toast.success("Termo assinado e OS cancelada!");
        else if (data.signed) toast.success("Termo assinado!");
        else toast.info("Termo de devolucao ainda nao assinado.");
        invalidateOrder();
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const requestBudgetApprovalMut = useMutation(
    trpc.serviceOrder.requestBudgetApproval.mutationOptions({
      onSuccess: (data: { whatsappSent: boolean }) => {
        toast.success(data.whatsappSent ? "Orcamento enviado ao cliente por WhatsApp!" : "Orcamento marcado como enviado (WhatsApp indisponivel).");
        invalidateOrder();
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const updateTechnicalInfoMut = useMutation(
    trpc.serviceOrder.updateTechnicalInfo.mutationOptions({
      onSuccess: () => { toast.success("Informacoes tecnicas atualizadas!"); cb.setTechInfoDialog(false); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const updateTechnicianMut = useMutation(
    trpc.serviceOrder.updateTechnician.mutationOptions({
      onSuccess: () => { toast.success("Tecnico atualizado!"); cb.setChangeTechDialog(false); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  return {
    invalidateOrder,
    updateStatusMut,
    cancelMut,
    uncancelMut,
    refundMut,
    deleteMut,
    addItemMut,
    removeItemMut,
    registerPaymentMut,
    createFromOSMut,
    updateCostsMut,
    confirmSigMut,
    sendForSignatureMut,
    checkSignatureStatusMut,
    notifyCompletedMut,
    updateItemMut,
    cancelQuoteMut,
    approveQuoteMut,
    sendTrackingMut,
    sendToLabMut,
    receiveFromLabMut,
    cancelLabMut,
    notifyDeliveryPersonMut,
    sendReceiptMut,
    sendDeliveryTermMut,
    confirmPhysicalDeliveryTermMut,
    checkDeliveryTermStatusMut,
    sendReturnTermMut,
    confirmPhysicalReturnTermMut,
    checkReturnTermStatusMut,
    requestBudgetApprovalMut,
    updateTechnicalInfoMut,
    updateTechnicianMut,
  };
}
