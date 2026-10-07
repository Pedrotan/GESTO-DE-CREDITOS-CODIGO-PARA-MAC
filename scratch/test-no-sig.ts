import jsPDF from '../src/bibliotecas/pdf-documento';
import { contractDesign, contractText, type SoftwareContract } from '../src/bibliotecas/contrato-software';

export function contractParagraphs(body:string) {
    const out:string[]=[];
    for(const line of body.split('\n')) {
        const value=line.trim(),previous=out[out.length-1];
        const boundary=/^(?:\d+[.)]|\d+\.\d+\.|[a-z]\)|[A-ZÀ-Ý][\wÀ-ÿ /.-]{0,35}:|Pelo |Assinatura|Carimbo|Nome |Cargo |Data |Anexo |Cláusula )/.test(value);
        if(value && previous && previous.length>=55 && !/[.;:!?_]$/.test(previous) && !boundary)out[out.length-1]=previous+' '+value;
        else out.push(value);
    }
    return out;
}

export function softwareContractPdf(contract:SoftwareContract,logo?:string) {
    const doc=new jsPDF(),design=contractDesign(contract),left=24,width=162,bottom=252;
    const clean=(text:string)=>text.replace(/[—–]/g,'-').replace(/●/g,'.').replace(/×/g,'x').replace(/\t/g,'    ');
    const rgb=(hex:string):[number,number,number]=>[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];
    const polygon=(points:number[][],color:string)=>{doc.setFillColor(...rgb(color));doc.lines(points.slice(1).map((p,i)=>[p[0]-points[i][0],p[1]-points[i][1]]),points[0][0],points[0][1],[1,1],'F',true);};
    const decorate=()=>{
        doc.setFillColor(...rgb(design.paper));doc.rect(0,0,210,297,'F');
        // Faixas cruzadas do papel timbrado de referência, desenhadas como vetores.
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
        const visibleLogo=design.logo || logo;let headingLeft=26;
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
    };
    let y=70;decorate();
    const page=()=>{doc.addPage();decorate();y=70;};
    const write=(text:string,bold=false,center=false)=>{
        if(!text){y+=3;return;}
        doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(bold?11:10);
        const lines:string[]=doc.splitTextToSize(clean(contractText(text,contract)),width);
        if(bold && y+Math.min(lines.length+2,6)*5>bottom)page();
        for(let i=0;i<lines.length;i++) {
            if(y+5>bottom)page();
            doc.setTextColor(...rgb(bold?design.primary:design.text));doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(bold?11:10);
            const line=lines[i],words=line.trim().split(/\s+/);
            if(center)doc.text(line,105,y,{align:'center'});
            else if(!bold && i<lines.length-1 && words.length>1){
                const wordsWidth=words.reduce((sum,word)=>sum+doc.getTextWidth(word),0),gap=(width-wordsWidth)/(words.length-1);let x=left;
                for(const word of words){doc.text(word,x,y);x+=doc.getTextWidth(word)+gap;}
            }else doc.text(line,left,y);
            y+=5;
        }
        y+=bold?3:2;
    };
    write(contract.title,true,true);write('Contrato n.º '+(contract.number||'[A preencher]'),false,true);
    if(contract.client)write('Cliente: '+contract.client+(contract.nif?' | NIF: '+contract.nif:''),false,true);
    y+=5;
    const height=(paragraphs:string[])=>{
        doc.setFont('helvetica','normal');doc.setFontSize(10);
        return paragraphs.reduce((sum,text)=>sum+(text?doc.splitTextToSize(clean(contractText(text,contract)),width).length*5+2:3),0);
    };
    for(const section of contract.sections){
        // Mantém os campos tabulares dos anexos em linhas separadas.
        const paragraphs=section.title.startsWith('Anexo ')?section.body.split('\n'):contractParagraphs(section.body);
        const sectionHeight=height(paragraphs)+16;
        if(section.title==='Assinaturas') continue; if(false && sectionHeight<bottom-70 && y+sectionHeight>bottom)page();
        y+=3;write(section.title,true);
        for(let index=0;index<paragraphs.length;index++){
            if(paragraphs[index].trim()==='Pelo Fornecedor'){
                const rest=paragraphs.slice(index),signatureHeight=height(rest);
                if(signatureHeight<bottom-70 && y+signatureHeight>bottom)page();
            }
            write(paragraphs[index]);
        }
    }
    const count=doc.getNumberOfPages();
    for(let i=1;i<=count;i++){doc.setPage(i);doc.setTextColor(...rgb(design.primary));doc.setFont('helvetica','normal');doc.setFontSize(7);doc.text('Contrato '+clean(contract.number||'sem número'),24,259);doc.text('Página '+i+' de '+count,186,294,{align:'right'});}
    doc.setProperties({title:contract.title,subject:'Licenciamento e venda - '+contract.software,author:design.company});
    return doc;
}
