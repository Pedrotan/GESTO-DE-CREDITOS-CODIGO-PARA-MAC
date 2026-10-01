import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/bibliotecas/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const hasDialogDescription = (node: React.ReactNode): boolean => {
  if (!node) return false;
  if (React.isValidElement(node)) {
    const type = node.type as any;
    if (
      type?.displayName === "DialogDescription" ||
      type?.displayName === "DialogPrimitive.Description" ||
      type?.displayName === "Description" ||
      type === DialogPrimitive.Description
    ) {
      return true;
    }
    if (node.props && node.props.children) {
      return React.Children.toArray(node.props.children).some(hasDialogDescription);
    }
  }
  return false;
};

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { overlayClassName?: string }
>(({ className, overlayClassName, children, ...props }, ref) => {
  const containsDescription = React.Children.toArray(children).some(hasDialogDescription);
  const { onPointerDownOutside, ...contentProps } = props;

  React.useEffect(() => {
    // SweetAlert vive no body; o FocusScope do Radix nao deve recuperar o foco do botao OK.
    const allowSweetAlertFocus = (event: FocusEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const relatedTarget = event.relatedTarget instanceof Element ? event.relatedTarget : null;
      if (target?.closest('.swal2-container') || relatedTarget?.closest('.swal2-container')) {
        event.stopPropagation();
      }
    };
    window.addEventListener('focusin', allowSweetAlertFocus, true);
    window.addEventListener('focusout', allowSweetAlertFocus, true);
    return () => {
      window.removeEventListener('focusin', allowSweetAlertFocus, true);
      window.removeEventListener('focusout', allowSweetAlertFocus, true);
    };
  }, []);
  
  return (
    <DialogPortal>
      <DialogOverlay className={overlayClassName} />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 overflow-hidden rounded-2xl border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
          className,
        )}
        {...(containsDescription ? {} : { "aria-describedby": undefined })}
        {...contentProps}
        onPointerDownOutside={(event) => {
          const target = event.detail.originalEvent.target;
          if (target instanceof Element && target.closest('.swal2-container')) {
            event.preventDefault();
          }
          onPointerDownOutside?.(event);
        }}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-lg opacity-90 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-white/10 text-white shadow-sm">
          <X className="h-5 w-5" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left bg-sidebar text-white -mx-6 -mt-6 px-8 pt-10 pb-7 shadow-lg mb-6 border-b border-white/10 relative overflow-hidden", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-2xl font-bold leading-tight tracking-tight text-white drop-shadow-sm", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-white/80 leading-relaxed", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
