from pathlib import Path
p=Path('src/bibliotecas/contrato-software-pdf.ts')
s=p.read_text(encoding='utf-8-sig');start=s.index('        polygon([[8,8]');end=s.index('    };',start)
s=s[:start]+'''        // Faixas cruzadas do papel timbrado de referência, desenhadas como vetores.
        polygon([[0,8],[146,8],[153,19],[0,19]],design.primary);
        polygon([[151,14],[210,14],[210,25],[158,25]],design.accent);
        polygon([[103,8],[120,0],[133,0],[143,8]],design.accent);
        polygon([[155,25],[184,25],[166,34]],design.primary);
        polygon([[120,0],[132,0],[152,34],[140,34]],design.accent);
        polygon([[132,0],[134,0],[154,34],[152,34]],design.paper);
        polygon([[134,0],[146,0],[167,34],[154,34]],design.primary);
        doc.setDrawColor(...rgb(design.paper));doc.setLineWidth(.7);doc.line(0,17,130,17);doc.line(157,16,210,16);
        polygon([[0,281],[44,281],[50,287],[0,287]],design.accent);
        polygon([[58,285],[210,285],[210,292],[62,292]],design.primary);
        polygon([[26,281],[38,275],[46,275],[53,281]],design.primary);
        polygon([[38,275],[46,275],[59,297],[51,297]],design.primary);
        polygon([[46,275],[48,275],[61,297],[59,297]],design.paper);
        polygon([[48,275],[56,275],[69,297],[61,297]],design.accent);
        polygon([[69,297],[80,292],[66,292]],design.accent);
        doc.setDrawColor(...rgb(design.paper));doc.setLineWidth(.7);doc.line(0,286,44,286);doc.line(65,287,210,287);
        const visibleLogo=logo;let headingLeft=26;
        if(visibleLogo){try{const image=doc.getImageProperties(visibleLogo),ratio=image.width/image.height;
            const w=Math.min(26,22*ratio),h=w/ratio;doc.addImage(visibleLogo,image.fileType,26,37+(22-h)/2,w,h);headingLeft=58;
        }catch{/* O nome permanece disponível mesmo sem imagem válida. */}}
        doc.setTextColor(...rgb(design.accent));doc.setFont('helvetica','bold');let size=17;doc.setFontSize(size);
        while(doc.getTextWidth(clean(design.company))>150-headingLeft && size>8)doc.setFontSize(--size);
        const heading:string[]=doc.splitTextToSize(clean(design.company),150-headingLeft);doc.text(heading,headingLeft,45);
        doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(...rgb(design.primary));
        doc.text(doc.splitTextToSize(clean(design.tagline),150-headingLeft).slice(0,2),headingLeft,45+heading.length*5);
        doc.setFontSize(7);doc.setTextColor(...rgb(design.text));
        doc.text(doc.splitTextToSize(clean(design.contacts),90).slice(0,2),184,264,{align:'right'});
        doc.text(doc.splitTextToSize(clean(design.address),90).slice(0,2),184,274,{align:'right'});
''' +s[end:]
s=s.replace('bottom=256','bottom=252').replace('let y=60','let y=70').replace('y=60;','y=70;').replace('bottom-60','bottom-70').replace('24,292','24,279').replace('186,292','186,294')
p.write_text(s,encoding='utf-8')
